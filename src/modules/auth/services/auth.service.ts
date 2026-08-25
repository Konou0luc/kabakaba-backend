import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/services/prisma.service';
import { UsersService, sanitize } from '../../users/services/users.service';
import { SmsService } from '../../sms/services/sms.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { LoginEmailDto } from '../dto/login-email.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly smsService: SmsService,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto) {
    const { phone } = sendOtpDto;

    await this.prisma.otpCode.deleteMany({
      where: { phone, expiresAt: { lt: new Date() } },
    });

    const existingOtp = await this.prisma.otpCode.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
    });

    if (existingOtp && existingOtp.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code OTP');
    }

    // SÉCURITÉ : crypto.randomInt (CSPRNG) au lieu de Math.random() — un
    // code d'authentification ne doit jamais reposer sur un générateur
    // pseudo-aléatoire non cryptographique.
    const code = crypto.randomInt(100000, 1000000).toString();
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (existingOtp) {
      await this.prisma.otpCode.update({
        where: { id: existingOtp.id },
        data: {
          code: hashedCode,
          expiresAt,
          attempts: existingOtp.attempts + 1,
        },
      });
    } else {
      await this.prisma.otpCode.create({
        data: {
          phone,
          code: hashedCode,
          expiresAt,
        },
      });
    }

    try {
      await this.smsService.sendSms(
        phone,
        `Votre code de vérification Kabakaba est: ${code}`,
      );
    } catch (error) {
      console.error(`Erreur lors de l'envoi du SMS OTP: ${error.message}`);
    }

    return {
      message: 'Code OTP envoyé avec succès',
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const { phone, code } = verifyOtpDto;

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, used: false, expiresAt: { gt: new Date() } },
    });

    if (!otp) {
      throw new BadRequestException('Code OTP invalide ou expiré');
    }

    // SÉCURITÉ : plafond de tentatives vérifié AVANT la comparaison — sans
    // ça, `attempts` n'était incrémenté qu'à la régénération d'un code,
    // jamais lors d'un échec de vérification, laissant un même code
    // brute-forçable sans limite pendant ses 5 minutes de validité.
    if (otp.attempts >= 5) {
      throw new BadRequestException('Trop de tentatives, veuillez demander un nouveau code OTP');
    }

    const isValid = await bcrypt.compare(code, otp.code);
    if (!isValid) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('Code OTP invalide ou expiré');
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { used: true },
    });

    let user = await this.usersService.findByPhone(phone);

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone,
          role: UserRole.STUDENT,
        },
      });
    }

    const tokens = await this.getTokens(user.id, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: sanitize(user),
      ...tokens,
    };
  }

  async loginEmail(loginEmailDto: LoginEmailDto) {
    const { email, password } = loginEmailDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    if (!user.password) throw new UnauthorizedException('Veuillez utiliser la connexion par téléphone');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Identifiants invalides');

    const tokens = await this.getTokens(user.id, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      user: sanitize(user),
      ...tokens,
    };
  }

  /**
   * Flux "mot de passe temporaire → mot de passe personnel" : requis pour
   * tout compte créé par un admin avec User.mustChangePassword=true (ex :
   * vendeur créé via POST /vendors). Vérifie l'ancien mot de passe avant
   * d'accepter le nouveau, comme n'importe quel changement de mot de passe.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!user.password) throw new UnauthorizedException('Ce compte ne peut pas changer de mot de passe');

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) throw new UnauthorizedException('Mot de passe actuel incorrect');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, mustChangePassword: false },
    });

    return { success: true };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
        include: { refreshTokens: true },
      });

      if (!user) throw new UnauthorizedException();

      // hashedToken est un hash bcrypt (salé) : impossible de le comparer
      // via une clause WHERE, on compare donc candidat par candidat parmi
      // les tokens non expirés de cet utilisateur (révoqués INCLUS, pour
      // pouvoir détecter une réutilisation — voir plus bas).
      const candidates = user.refreshTokens.filter((rt) => rt.expiresAt > new Date());

      let matched: (typeof candidates)[number] | null = null;
      for (const rt of candidates) {
        if (await bcrypt.compare(refreshToken, rt.hashedToken)) {
          matched = rt;
          break;
        }
      }

      if (!matched) throw new UnauthorizedException();

      if (matched.revoked) {
        // SÉCURITÉ : ce refresh token a déjà été consommé une fois (rotation
        // précédente). Le revoir signifie soit un double-clic client, soit —
        // plus grave — qu'il a été volé et qu'un attaquant tente de
        // l'utiliser après (ou avant) le titulaire légitime. Dans le doute,
        // on tue toute la famille de tokens : la session entière doit se
        // reconnecter.
        await this.prisma.refreshToken.updateMany({
          where: { userId: user.id, familyId: matched.familyId, revoked: false },
          data: { revoked: true },
        });
        throw new UnauthorizedException('Session invalidée, veuillez vous reconnecter');
      }

      // Rotation légitime : on révoque IMMÉDIATEMENT le token consommé avant
      // d'en émettre un nouveau dans la même famille.
      await this.prisma.refreshToken.update({
        where: { id: matched.id },
        data: { revoked: true },
      });

      const tokens = await this.getTokens(user.id, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken, matched.familyId);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Token de renouvellement invalide');
    }
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    return {
      message: 'Déconnexion réussie',
    };
  }

  private async getTokens(userId: string, role: UserRole) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, role },
        {
          secret: this.configService.get('JWT_ACCESS_SECRET'),
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, role },
        {
          secret: this.configService.get('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshToken(userId: string, refreshToken: string, familyId?: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken: hashedRefreshToken,
        expiresAt,
        // Si aucune famille n'est fournie (connexion initiale), le schéma
        // en génère une nouvelle via @default(uuid()).
        ...(familyId ? { familyId } : {}),
      },
    });
  }
}
