import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../database/services/prisma.service';

const SALT_ROUNDS = 10;
const CHALLENGE_TOKEN_TTL = '5m';
const ONBOARDING_TOKEN_TTL = '20m';
const SESSION_TOKEN_TTL = '8h';
const PASSWORD_RESET_SESSION_TTL = '5m';
const BACKUP_CODE_COUNT = 10;

type TokenPurpose = 'web_2fa_challenge' | 'web_onboarding' | 'web_session' | 'web_password_reset';

@Injectable()
export class WebAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get accessSecret() {
    const secret = this.configService.get('JWT_WEB_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_WEB_ACCESS_SECRET manquant — démarrage refusé pour des raisons de sécurité');
    return secret;
  }

  private signToken(sub: string, purpose: TokenPurpose, expiresIn: string, extra: Record<string, unknown> = {}) {
    return this.jwtService.sign(
      { sub, purpose, ...extra },
      { secret: this.accessSecret, expiresIn: expiresIn as any },
    );
  }

  private async verifyToken(token: string, expectedPurpose: TokenPurpose) {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(token, { secret: this.accessSecret });
    } catch {
      throw new UnauthorizedException('Jeton invalide ou expiré');
    }
    if (payload.purpose !== expectedPurpose) {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }
    return payload;
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

  async login(email: string, password: string) {
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser) throw new UnauthorizedException('Identifiants invalides');

    const isPasswordValid = await bcrypt.compare(password, webUser.password);
    if (!isPasswordValid) throw new UnauthorizedException('Identifiants invalides');

    // Vérifié APRÈS le mot de passe, et AVANT isActive : un compte tout
    // juste créé (isActive=false, mustChangePassword=true) doit être
    // redirigé vers l'onboarding (409), pas rejeté en 401 générique.
    if (webUser.mustChangePassword) {
      throw new ConflictException(
        "Ce compte doit d'abord compléter sa première connexion (mot de passe temporaire + configuration 2FA)",
      );
    }

    if (!webUser.isActive) throw new UnauthorizedException('Identifiants invalides');

    const challengeToken = this.signToken(webUser.id, 'web_2fa_challenge', CHALLENGE_TOKEN_TTL);
    return { challengeToken };
  }

  async verify2fa(challengeToken: string, code: string) {
    const { sub } = await this.verifyToken(challengeToken, 'web_2fa_challenge');
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser || !webUser.isActive || !webUser.twoFaEnabled || !webUser.twoFaSecret) {
      throw new UnauthorizedException();
    }

    const { valid: codeIsValid, backupCodeUsed } = await this.verifyTotpOrBackupCode(
      webUser.id,
      webUser.twoFaSecret,
      code,
    );
    if (!codeIsValid) throw new UnauthorizedException('Code invalide');

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

  async firstLogin(email: string, temporaryPassword: string) {
    // Volontairement PAS de vérification isActive ici : un compte tout
    // juste créé est inactif par conception, et ne devient actif qu'à la
    // toute fin de l'onboarding (voir verifyTwoFactorSetup).
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser) throw new UnauthorizedException('Identifiants invalides');

    if (!webUser.mustChangePassword) {
      throw new ConflictException('Ce compte a déjà terminé sa première connexion — utilisez la connexion normale');
    }

    const isValid = await bcrypt.compare(temporaryPassword, webUser.password);
    if (!isValid) throw new UnauthorizedException('Identifiants invalides');

    const onboardingToken = this.signToken(webUser.id, 'web_onboarding', ONBOARDING_TOKEN_TTL);
    return { onboardingToken };
  }

  async setOnboardingPassword(onboardingToken: string, newPassword: string) {
    const { sub } = await this.verifyToken(onboardingToken, 'web_onboarding');

    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser) throw new UnauthorizedException('Jeton invalide ou expiré');

    // Empêche de garder le mot de passe temporaire transmis par l'équipe
    // dirigeante comme mot de passe personnel définitif.
    await this.assertPasswordAcceptable(newPassword, webUser.password);

    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.prisma.webUser.update({ where: { id: sub }, data: { password: hashedPassword } });
    return { success: true };
  }

  async setupTwoFactor(onboardingToken: string) {
    const { sub } = await this.verifyToken(onboardingToken, 'web_onboarding');
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser) throw new NotFoundException();

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'kabakaba Admin', label: webUser.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.webUser.update({ where: { id: sub }, data: { twoFaSecret: secret } });

    return {
      qrCodeDataUrl,
      manualKey: secret,
      otpauthUrl,
    };
  }

  async verifyTwoFactorSetup(onboardingToken: string, code: string) {
    const { sub } = await this.verifyToken(onboardingToken, 'web_onboarding');
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser || !webUser.twoFaSecret) {
      throw new UnauthorizedException("Configurez d'abord le 2FA avant de vérifier le code");
    }

    const { valid: isValid } = await verifyOtp({ secret: webUser.twoFaSecret, token: code });
    if (!isValid) throw new UnauthorizedException('Code invalide');

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

  // ─── Réinitialisation de mot de passe (TOTP ou clé de secours) ──────
  //
  // Facteur unique volontaire : aucun canal externe (email/SMS) branché.
  // Possession du TOTP (ou d'une clé de secours) suffit à elle seule à
  // réinitialiser le mot de passe — décision assumée, pas de canal
  // externe disponible pour le moment.
  //
  // Anti-énumération : la même erreur générique est renvoyée que le
  // compte n'existe pas, n'ait pas de 2FA actif, ou que le code soit
  // invalide — aucune différence observable entre ces cas.

  async verifyPasswordReset(email: string, code: string) {
    const genericError = new UnauthorizedException('Identifiants ou code invalides');

    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (
      !webUser ||
      !webUser.isActive ||
      webUser.deletedAt ||
      webUser.mustChangePassword ||
      !webUser.twoFaEnabled ||
      !webUser.twoFaSecret
    ) {
      throw genericError;
    }

    const { valid: codeIsValid, backupCodeUsed } = await this.verifyTotpOrBackupCode(
      webUser.id,
      webUser.twoFaSecret,
      code,
    );
    if (!codeIsValid) throw genericError;

    const resetSessionToken = this.signToken(webUser.id, 'web_password_reset', PASSWORD_RESET_SESSION_TTL);

    return {
      resetSessionToken,
      ...(backupCodeUsed
        ? { warning: 'Clé de secours utilisée — celle-ci est maintenant consommée.' }
        : {}),
    };
  }

  async confirmPasswordReset(resetSessionToken: string, newPassword: string) {
    const { sub } = await this.verifyToken(resetSessionToken, 'web_password_reset');

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
}
