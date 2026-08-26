import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
  private readonly logger = new Logger(AuthService.name);

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
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

    if (!otp || !(await bcrypt.compare(code, otp.code))) {
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
      // les tokens de cet utilisateur.
      const activeCandidates = user.refreshTokens.filter(
        (rt) => !rt.revoked && rt.expiresAt > new Date(),
      );

      let matchedActive: (typeof user.refreshTokens)[number] | undefined;
      for (const rt of activeCandidates) {
        if (await bcrypt.compare(refreshToken, rt.hashedToken)) {
          matchedActive = rt;
          break;
        }
      }

      if (!matchedActive) {
        // Détection de réutilisation : ce refresh token ne correspond à
        // aucun token actif — vérifie s'il correspond à un token DÉJÀ
        // révoqué (donc déjà utilisé une fois pour se renouveler). Le
        // présenter à nouveau signale un vol probable (le token légitime
        // a déjà tourné, celui-ci est une copie interceptée). Dans ce cas,
        // on révoque toute la session de l'utilisateur par précaution,
        // plutôt que de simplement rejeter cette seule requête.
        const revokedCandidates = user.refreshTokens.filter((rt) => rt.revoked);
        for (const rt of revokedCandidates) {
          if (await bcrypt.compare(refreshToken, rt.hashedToken)) {
            this.logger.warn(
              `Réutilisation d'un refresh token déjà révoqué détectée pour l'utilisateur ${user.id} — révocation de toute la session par précaution.`,
            );
            await this.prisma.refreshToken.updateMany({
              where: { userId: user.id, revoked: false },
              data: { revoked: true },
            });
            break;
          }
        }
        throw new UnauthorizedException();
      }

      // Rotation : le token utilisé est révoqué avant qu'un nouveau ne soit
      // émis, pour qu'il ne puisse plus jamais être présenté une seconde
      // fois (une seconde présentation est alors détectée ci-dessus comme
      // une réutilisation suspecte).
      await this.prisma.refreshToken.update({
        where: { id: matchedActive.id },
        data: { revoked: true },
      });

      const tokens = await this.getTokens(user.id, user.role);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return tokens;
    } catch (error) {
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

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken: hashedRefreshToken,
        expiresAt,
      },
    });
  }
}
