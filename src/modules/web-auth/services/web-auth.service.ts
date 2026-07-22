import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verify as verifyOtp } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../database/services/prisma.service';

const SALT_ROUNDS = 10;
const CHALLENGE_TOKEN_TTL = '5m';
const ONBOARDING_TOKEN_TTL = '20m';
const SESSION_TOKEN_TTL = '8h';

type TokenPurpose = 'web_2fa_challenge' | 'web_onboarding' | 'web_session';

@Injectable()
export class WebAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  private get accessSecret() {
    return this.configService.get('JWT_WEB_ACCESS_SECRET') || 'fallback-web-secret';
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

  private sanitize(webUser: any) {
    const { password, twoFaSecret, twoFaBackupCode, ...safe } = webUser;
    return safe;
  }

  // ─── Étape 1/2 : connexion normale (identifiants → 2FA) ─────────────

  async login(email: string, password: string) {
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser || !webUser.isActive) throw new UnauthorizedException('Identifiants invalides');

    const isPasswordValid = await bcrypt.compare(password, webUser.password);
    if (!isPasswordValid) throw new UnauthorizedException('Identifiants invalides');

    if (webUser.mustChangePassword) {
      throw new ConflictException(
        'Ce compte doit d\'abord compléter sa première connexion (mot de passe temporaire + configuration 2FA)',
      );
    }

    const challengeToken = this.signToken(webUser.id, 'web_2fa_challenge', CHALLENGE_TOKEN_TTL);
    return { challengeToken };
  }

  async verify2fa(challengeToken: string, code: string) {
    const { sub } = await this.verifyToken(challengeToken, 'web_2fa_challenge');
    const webUser = await this.prisma.webUser.findUnique({ where: { id: sub } });
    if (!webUser || !webUser.isActive || !webUser.twoFaEnabled || !webUser.twoFaSecret) {
      throw new UnauthorizedException();
    }

    const { valid: codeIsValid } = await verifyOtp({ secret: webUser.twoFaSecret, token: code });
    let backupCodeUsed = false;

    if (!codeIsValid) {
      const backupMatches = webUser.twoFaBackupCode
        ? await bcrypt.compare(code, webUser.twoFaBackupCode)
        : false;
      if (!backupMatches) throw new UnauthorizedException('Code invalide');
      backupCodeUsed = true;
    }

    const updated = await this.prisma.webUser.update({
      where: { id: webUser.id },
      data: {
        lastLoginAt: new Date(),
        // Une clé de secours est à usage unique — on la consomme dès qu'elle sert.
        ...(backupCodeUsed ? { twoFaBackupCode: null } : {}),
      },
    });

    const accessToken = this.signToken(webUser.id, 'web_session', SESSION_TOKEN_TTL, { role: webUser.role });

    return {
      accessToken,
      webUser: this.sanitize(updated),
      ...(backupCodeUsed
        ? { warning: 'Connexion effectuée avec la clé de secours — celle-ci est maintenant consommée. Reconfigurez le 2FA pour en obtenir une nouvelle.' }
        : {}),
    };
  }

  // ─── Étapes 1 à 4 : première connexion (mot de passe temporaire) ────

  async firstLogin(email: string, temporaryPassword: string) {
    const webUser = await this.prisma.webUser.findUnique({ where: { email } });
    if (!webUser || !webUser.isActive) throw new UnauthorizedException('Identifiants invalides');

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
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // mustChangePassword reste true : l'onboarding n'est complet qu'une fois
    // le 2FA vérifié (étape 4) — sinon un compte pourrait rester bloqué sans
    // 2FA configuré mais sans accès à la connexion normale non plus.
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

    // Secret stocké mais twoFaEnabled reste false tant que l'étape de
    // vérification (setupTwoFactor + code) n'a pas confirmé la configuration.
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
      throw new UnauthorizedException('Configurez d\'abord le 2FA avant de vérifier le code');
    }

    const { valid: isValid } = await verifyOtp({ secret: webUser.twoFaSecret, token: code });
    if (!isValid) throw new UnauthorizedException('Code invalide');

    const backupCode = this.generateBackupCode();
    const hashedBackupCode = await bcrypt.hash(backupCode, SALT_ROUNDS);

    const updated = await this.prisma.webUser.update({
      where: { id: webUser.id },
      data: {
        twoFaEnabled: true,
        twoFaBackupCode: hashedBackupCode,
        mustChangePassword: false,
        lastLoginAt: new Date(),
      },
    });

    const accessToken = this.signToken(webUser.id, 'web_session', SESSION_TOKEN_TTL, { role: webUser.role });

    return {
      accessToken,
      webUser: this.sanitize(updated),
      backupCode, // affiché une seule fois, comme dans la maquette (étape 5)
    };
  }

  private generateBackupCode(): string {
    const random = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${random()}-${random()}-${random()}-${random()}`;
  }
}
