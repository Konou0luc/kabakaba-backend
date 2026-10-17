import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../database/services/prisma.service';
import { WebUserRole } from '@prisma/client';
import { decryptSecret, encryptSecret } from '../../../common/utils/secret-crypto';
import { SmsService } from '../../sms/services/sms.service';

const SALT_ROUNDS = 10;
// 10 minutes plutôt que 5 : entre la saisie du mot de passe et le
// basculement vers l'appli d'authentification pour lire le code TOTP, 5
// minutes s'avéraient trop courtes en usage réel et provoquaient des
// "Jeton invalide, expiré ou déjà consommé" au moindre temps de flottement.
const CHALLENGE_TOKEN_TTL = '10m';
const ONBOARDING_TOKEN_TTL = '20m';
const SESSION_TOKEN_TTL = '8h';
const PASSWORD_RESET_SESSION_TTL = '5m';
const BACKUP_CODE_COUNT = 10;

type TokenPurpose = 'web_2fa_challenge' | 'web_onboarding' | 'web_session' | 'web_password_reset';

@Injectable()
export class WebAuthService {
  private readonly logger = new Logger(WebAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  private get accessSecret() {
    const secret = this.configService.get('JWT_WEB_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_WEB_ACCESS_SECRET manquant — démarrage refusé pour des raisons de sécurité');
    return secret;
  }

  private signToken(
    sub: string,
    purpose: TokenPurpose,
    expiresIn: string,
    extra: Record<string, unknown> = {},
  ) {
    return this.jwtService.sign(
      { sub, purpose, ...extra },
      { secret: this.accessSecret, expiresIn: expiresIn as any },
    );
  }

  /**
   * Les jetons temporaires ne sont plus auto-porteurs uniquement : leur JTI
   * est enregistré en base et leur consommation est atomique. Cela permet
   * de rendre les challenges réellement non réutilisables, y compris en cas
   * de requêtes concurrentes.
   */
  private async issueFlowToken(
    webUserId: string,
    purpose: Exclude<TokenPurpose, 'web_session'>,
    expiresIn: string,
    step: number,
  ) {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.parseTtlMs(expiresIn));

    await this.prisma.webAuthChallenge.create({
      data: {
        id: jti,
        webUserId,
        purpose,
        step,
        expiresAt,
      },
    });

    return this.signToken(webUserId, purpose, expiresIn, { jti, step });
  }

  private parseTtlMs(ttl: string) {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`TTL invalide: ${ttl}`);
    const value = Number(match[1]);
    const unitMs: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return value * unitMs[match[2]];
  }

  private async validateFlowToken(
    token: string,
    expectedPurpose: Exclude<TokenPurpose, 'web_session'>,
    expectedStep: number,
  ) {
    let payload: { sub: string; purpose: string; jti?: string; step?: number };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }

    if (
      payload.purpose !== expectedPurpose ||
      !payload.jti ||
      payload.step !== expectedStep
    ) {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }

    const challenge = await this.prisma.webAuthChallenge.findFirst({
      where: {
        id: payload.jti,
        webUserId: payload.sub,
        purpose: expectedPurpose,
        step: expectedStep,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!challenge) {
      throw new UnauthorizedException('Jeton invalide, expiré ou déjà consommé');
    }

    return { sub: payload.sub, jti: payload.jti };
  }

  private async consumeFlowToken(
    token: string,
    expectedPurpose: Exclude<TokenPurpose, 'web_session'>,
    expectedStep: number,
  ) {
    let payload: { sub: string; purpose: string; jti?: string; step?: number };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }

    if (
      payload.purpose !== expectedPurpose ||
      !payload.jti ||
      payload.step !== expectedStep
    ) {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }

    const consumed = await this.prisma.webAuthChallenge.updateMany({
      where: {
        id: payload.jti,
        webUserId: payload.sub,
        purpose: expectedPurpose,
        step: expectedStep,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      throw new UnauthorizedException('Jeton invalide, expiré ou déjà consommé');
    }

    return { sub: payload.sub };
  }

  /**
   * Vérifie la signature/le propos du JWT et que la ligne WebAuthChallenge
   * correspondante existe encore, SANS la consommer. Utilisé pour pouvoir
   * valider le code TOTP d'abord et ne marquer le jeton consommé qu'en cas
   * de succès — voir consumeSessionChallengeToken() et son commentaire.
   */
  private async peekSessionChallengeToken(token: string) {
    let payload: { sub: string; purpose: string; jti?: string };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
    if (payload.purpose !== 'web_2fa_challenge' || !payload.jti) {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }
    const challenge = await this.prisma.webAuthChallenge.findFirst({
      where: {
        id: payload.jti,
        webUserId: payload.sub,
        purpose: 'web_2fa_challenge',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge) {
      throw new UnauthorizedException('Jeton invalide, expiré ou déjà consommé');
    }
    return { sub: payload.sub, jti: payload.jti };
  }

  /**
   * Marque la ligne WebAuthChallenge consommée — à appeler UNIQUEMENT après
   * validation réussie du code TOTP (voir verify2fa). Consommer le jeton
   * avant de vérifier le code grillerait la tentative dès la moindre faute
   * de frappe : le challengeToken redevenant inutilisable, l'utilisateur
   * devrait reprendre toute la connexion depuis l'email/mot de passe pour
   * une simple faute de frappe sur 6 chiffres.
   */
  private async consumeSessionChallengeToken(jti: string, webUserId: string) {
    const consumed = await this.prisma.webAuthChallenge.updateMany({
      where: {
        id: jti,
        webUserId,
        purpose: 'web_2fa_challenge',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      // Course avec une autre requête (ex: double-clic) qui a consommé le
      // jeton entre le peek et ce point : on refuse plutôt que d'émettre
      // deux sessions valides pour un seul challenge.
      throw new UnauthorizedException('Jeton invalide, expiré ou déjà consommé');
    }
  }

  /**
   * Rejette un nouveau mot de passe s'il est trop faible OU s'il est
   * identique au mot de passe actuel de l'utilisateur — avec EXACTEMENT
   * le même message générique dans les deux cas. C'est volontaire : si un
   * attaquant devine par hasard l'ancien mot de passe réel, sa tentative
   * doit être indiscernable d'un simple refus pour faiblesse. Une erreur
   * du type "ce mot de passe a déjà été utilisé" lui confirmerait qu'il a
   * trouvé le bon mot de passe, ce qui est exactement l'information à ne
   * jamais laisser fuiter.
   */
  private async assertPasswordAcceptable(newPassword: string, currentPasswordHash: string) {
    const genericError = new BadRequestException('Ce mot de passe ne peut pas être utilisé. Choisissez-en un autre.');

    const isStrongEnough =
      newPassword.length >= 12 &&
      /[A-Z]/.test(newPassword) &&
      /[0-9]/.test(newPassword) &&
      /[^A-Za-z0-9]/.test(newPassword);
    if (!isStrongEnough) throw genericError;

    const isSameAsCurrent = await bcrypt.compare(newPassword, currentPasswordHash);
    if (isSameAsCurrent) throw genericError;
  }

  private sanitize(webUser: any) {
    const { password, twoFaSecret, ...safe } = webUser;
    return safe;
  }

  private issueSessionToken(webUser: { id: string; role: string; tokenVersion: number }) {
    return this.signToken(webUser.id, 'web_session', SESSION_TOKEN_TTL, {
      role: webUser.role,
      tokenVersion: webUser.tokenVersion,
    });
  }

  /**
   * Vérifie `code` contre le secret TOTP de l'utilisateur, et à défaut
   * contre ses codes de secours actifs (usedAt = null). Marque le code de
   * secours utilisé comme consommé. Retourne { valid, backupCodeUsed }.
   */
  private async getTotpSecret(storedSecret: string): Promise<string> {
    const decoded = decryptSecret(storedSecret);
    if (!decoded.wasEncrypted) {
      // Compatibilité avec les comptes existants : le secret en clair est
      // utilisé une dernière fois puis immédiatement migré en chiffré.
      const encrypted = encryptSecret(decoded.value);
      // L'appel est best-effort : une erreur de migration ne doit pas rendre
      // le code TOTP inutilisable, mais la clé d'encryption est obligatoire.
      await this.prisma.webUser.updateMany({
        where: { twoFaSecret: storedSecret },
        data: { twoFaSecret: encrypted },
      });
    }
    return decoded.value;
  }

  private async verifyTotpOrBackupCode(webUserId: string, secret: string, code: string) {
    const { valid: codeIsValid } = await verifyOtp({ secret, token: code });
    if (codeIsValid) return { valid: true, backupCodeUsed: false };

    const activeBackupCodes = await this.prisma.webUserBackupCode.findMany({
      where: { webUserId, usedAt: null },
    });

    for (const backupCode of activeBackupCodes) {
      if (await bcrypt.compare(code, backupCode.codeHash)) {
        await this.prisma.webUserBackupCode.update({
          where: { id: backupCode.id },
          data: { usedAt: new Date() },
        });
        return { valid: true, backupCodeUsed: true };
      }
    }

    return { valid: false, backupCodeUsed: false };
  }

  private generateBackupCodes(count: number): string[] {
    // crypto.randomBytes plutôt que Math.random() : source cryptographiquement
    // sûre, indispensable pour un secret qui donne un accès complet au compte.
    return Array.from({ length: count }, () => {
      const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 car. hex
      return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    });
  }

  // ─── Étape 1/2 : connexion normale (identifiants → 2FA) ─────────────

  async login(email: string, password: string, expectedRole?: WebUserRole) {
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser) throw new UnauthorizedException('Identifiants invalides');

    const isPasswordValid = await bcrypt.compare(password, webUser.password);
    if (!isPasswordValid) throw new UnauthorizedException('Identifiants invalides');

    // Contrôle d'espace : un compte Supervision qui se présente sur
    // l'espace Admin (ou l'inverse) reçoit EXACTEMENT le même message
    // qu'un mot de passe invalide — jamais une indication du rôle réel du
    // compte. Vérifié ici, avant toute autre branche (mustChangePassword,
    // isActive), pour qu'aucune information sur l'état du compte ne fuite
    // non plus à un compte qui frappe au mauvais endroit.
    if (expectedRole && webUser.role !== expectedRole) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // Vérifié APRÈS le mot de passe, et AVANT isActive : un compte tout
    // juste créé (isActive=false, mustChangePassword=true) doit être
    // redirigé vers l'onboarding (409), pas rejeté en 401 générique.
    if (webUser.mustChangePassword) {
      throw new ConflictException(
        "Ce compte doit d'abord compléter sa première connexion (mot de passe temporaire + configuration 2FA)",
      );
    }

    if (!webUser.isActive) throw new UnauthorizedException('Identifiants invalides');

    const challengeToken = await this.issueFlowToken(webUser.id, 'web_2fa_challenge', CHALLENGE_TOKEN_TTL, 1);
    return { challengeToken };
  }

  async verify2fa(challengeToken: string, code: string) {
    const { sub, jti } = await this.peekSessionChallengeToken(challengeToken);
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser || !webUser.isActive || !webUser.twoFaEnabled || !webUser.twoFaSecret) {
      throw new UnauthorizedException();
    }

    const { valid: codeIsValid, backupCodeUsed } = await this.verifyTotpOrBackupCode(
      webUser.id,
      await this.getTotpSecret(webUser.twoFaSecret),
      code,
    );
    if (!codeIsValid) throw new UnauthorizedException('Code invalide');

    // Le jeton n'est consommé qu'ici, une fois le code confirmé valide —
    // sinon une simple faute de frappe grillerait le challengeToken et
    // forcerait à tout reprendre depuis l'email/mot de passe.
    await this.consumeSessionChallengeToken(jti, webUser.id);

    const updated = await this.prisma.webUser.update({
      where: { id: webUser.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.issueSessionToken(updated);

    return {
      accessToken,
      webUser: this.sanitize(updated),
      ...(backupCodeUsed
        ? { warning: 'Connexion effectuée avec une clé de secours — celle-ci est maintenant consommée.' }
        : {}),
    };
  }

  // ─── Étapes 1 à 4 : première connexion (mot de passe temporaire) ────

  async firstLogin(email: string, temporaryPassword: string, expectedRole?: WebUserRole) {
    // Volontairement PAS de vérification isActive ici : un compte tout
    // juste créé est inactif par conception, et ne devient actif qu'à la
    // toute fin de l'onboarding (voir verifyTwoFactorSetup).
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser) throw new UnauthorizedException('Identifiants invalides');

    const isValid = await bcrypt.compare(temporaryPassword, webUser.password);
    if (!isValid) throw new UnauthorizedException('Identifiants invalides');

    // Même contrôle d'espace que login() — voir le commentaire là-bas.
    if (expectedRole && webUser.role !== expectedRole) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!webUser.mustChangePassword) {
      throw new ConflictException('Ce compte a déjà terminé sa première connexion — utilisez la connexion normale');
    }

    const onboardingToken = await this.issueFlowToken(webUser.id, 'web_onboarding', ONBOARDING_TOKEN_TTL, 1);
    return { onboardingToken };
  }

  async setOnboardingPassword(onboardingToken: string, newPassword: string) {
    const { sub } = await this.consumeFlowToken(onboardingToken, 'web_onboarding', 1);

    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser) throw new UnauthorizedException('Jeton invalide ou expiré');

    // Empêche de garder le mot de passe temporaire transmis par l'équipe
    // dirigeante comme mot de passe personnel définitif.
    await this.assertPasswordAcceptable(newPassword, webUser.password);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.webUser.update({ where: { id: sub }, data: { password: hashedPassword } });
    const nextOnboardingToken = await this.issueFlowToken(sub, 'web_onboarding', ONBOARDING_TOKEN_TTL, 2);
    return { success: true, onboardingToken: nextOnboardingToken };
  }

  async setupTwoFactor(onboardingToken: string) {
    const { sub } = await this.consumeFlowToken(onboardingToken, 'web_onboarding', 2);
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser) throw new NotFoundException();

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'kabakaba Admin', label: webUser.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.webUser.update({ where: { id: sub }, data: { twoFaSecret: encryptSecret(secret) } });

    const nextOnboardingToken = await this.issueFlowToken(sub, 'web_onboarding', ONBOARDING_TOKEN_TTL, 3);

    return {
      qrCodeDataUrl,
      manualKey: secret,
      otpauthUrl,
      onboardingToken: nextOnboardingToken,
    };
  }

  async verifyTwoFactorSetup(onboardingToken: string, code: string) {
    const { sub } = await this.validateFlowToken(onboardingToken, 'web_onboarding', 3);
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser || !webUser.twoFaSecret) {
      throw new UnauthorizedException("Configurez d'abord le 2FA avant de vérifier le code");
    }

    const { valid: isValid } = await verifyOtp({ secret: await this.getTotpSecret(webUser.twoFaSecret), token: code });
    if (!isValid) throw new UnauthorizedException('Code invalide');

    // La validation TOTP précède la consommation du jeton : un code TOTP
    // erroné ne brûle pas le challenge. La consommation reste atomique ;
    // une seule requête concurrente pourra donc finaliser l'onboarding.
    await this.consumeFlowToken(onboardingToken, 'web_onboarding', 3);

    const backupCodes = this.generateBackupCodes(BACKUP_CODE_COUNT);
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((c) => bcrypt.hash(c, SALT_ROUNDS)),
    );

    const updated = await this.prisma.webUser.update({
      where: { id: webUser.id },
      data: {
        twoFaEnabled: true,
        mustChangePassword: false,
        isActive: true, // ← le compte devient officiellement actif ici
        lastLoginAt: new Date(),
        backupCodes: {
          create: hashedBackupCodes.map((codeHash) => ({ codeHash })),
        },
      },
    });

    const accessToken = this.issueSessionToken(updated);

    return {
      accessToken,
      webUser: this.sanitize(updated),
      backupCodes, // en clair, une seule fois — jamais réaffichés ensuite
    };
  }

  // ─── Réinitialisation : SMS + TOTP (ou clé de secours) ──────────
  //
  // Le code d'authentification seul ne suffit plus. Le compte doit avoir
  // un téléphone : un SMS est envoyé, puis vérifié avec le TOTP.

  async startPasswordReset(email: string) {
    const generic = {
      message: 'Si le compte peut être réinitialisé, un code a été envoyé par SMS.',
    };
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!this.canResetPassword(webUser) || !webUser?.phone) return generic;

    try {
      await this.sendResetSms(webUser.phone);
    } catch (error) {
      this.logger.error(
        'Envoi du SMS de réinitialisation impossible',
        error instanceof Error ? error.stack : error,
      );
    }
    return generic;
  }

  async verifyPasswordReset(email: string, smsCode: string, code: string) {
    const genericError = new UnauthorizedException('Identifiants ou code invalides');

    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!this.canResetPassword(webUser) || !webUser?.phone) throw genericError;

    try {
      await this.consumeResetSms(webUser.phone, smsCode);
    } catch {
      throw genericError;
    }

    const { valid: codeIsValid, backupCodeUsed } = await this.verifyTotpOrBackupCode(
      webUser.id,
      await this.getTotpSecret(webUser.twoFaSecret!),
      code,
    );
    if (!codeIsValid) throw genericError;

    const resetSessionToken = await this.issueFlowToken(webUser.id, 'web_password_reset', PASSWORD_RESET_SESSION_TTL, 1);

    return {
      resetSessionToken,
      ...(backupCodeUsed
        ? { warning: 'Clé de secours utilisée — celle-ci est maintenant consommée.' }
        : {}),
    };
  }

  private canResetPassword(webUser: {
    isActive: boolean;
    deletedAt: Date | null;
    mustChangePassword: boolean;
    twoFaEnabled: boolean;
    twoFaSecret: string | null;
    phone: string | null;
  } | null): webUser is {
    isActive: boolean;
    deletedAt: Date | null;
    mustChangePassword: boolean;
    twoFaEnabled: boolean;
    twoFaSecret: string;
    phone: string | null;
  } {
    return Boolean(
      webUser &&
      webUser.isActive &&
      !webUser.deletedAt &&
      !webUser.mustChangePassword &&
      webUser.twoFaEnabled &&
      webUser.twoFaSecret,
    );
  }

  private resetPhoneKey(phone: string) {
    return `web-reset:${phone.trim()}`;
  }

  private async sendResetSms(phone: string) {
    const key = this.resetPhoneKey(phone);
    await this.prisma.otpCode.deleteMany({ where: { phone: key, expiresAt: { lt: new Date() } } });

    const existing = await this.prisma.otpCode.findFirst({
      where: { phone: key, used: false, expiresAt: { gt: new Date() } },
    });
    if (existing && existing.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code');
    }

    const smsCode = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = await bcrypt.hash(smsCode, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (existing) {
      await this.prisma.otpCode.update({
        where: { id: existing.id },
        data: { code: hashedCode, expiresAt, attempts: existing.attempts + 1 },
      });
    } else {
      await this.prisma.otpCode.create({
        data: { phone: key, code: hashedCode, expiresAt },
      });
    }

    try {
      await this.smsService.sendSms(phone, `Votre code de réinitialisation Kabakaba est: ${smsCode}`);
    } catch {
      throw new ServiceUnavailableException('Impossible d’envoyer le code de vérification.');
    }
  }

  private async consumeResetSms(phone: string, smsCode: string) {
    const key = this.resetPhoneKey(phone);
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone: key, used: false, expiresAt: { gt: new Date() } },
    });
    if (!otp || otp.attempts >= 5) {
      throw new UnauthorizedException('Identifiants ou code invalides');
    }

    const isValid = await bcrypt.compare(smsCode, otp.code);
    if (!isValid) {
      await this.prisma.otpCode.updateMany({
        where: { id: otp.id, used: false, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('Identifiants ou code invalides');
    }

    const claimed = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, used: false, expiresAt: { gt: new Date() } },
      data: { used: true },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException('Identifiants ou code invalides');
    }
  }

  async confirmPasswordReset(resetSessionToken: string, newPassword: string) {
    const { sub } = await this.consumeFlowToken(resetSessionToken, 'web_password_reset', 1);

    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser) throw new UnauthorizedException('Jeton invalide ou expiré');

    await this.assertPasswordAcceptable(newPassword, webUser.password);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // tokenVersion incrémenté : tout jeton de session émis avant cet
    // instant devient invalide au prochain appel (voir WebJwtStrategy),
    // sur tous les appareils — déconnexion globale immédiate.
    await this.prisma.webUser.update({
      where: { id: sub },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 },
      },
    });

    return { success: true };
  }
  async logout(webUserId: string) {
    await this.prisma.webUser.update({ where: { id: webUserId }, data: { tokenVersion: { increment: 1 } } });
    return { message: 'Déconnexion réussie' };
  }

}
