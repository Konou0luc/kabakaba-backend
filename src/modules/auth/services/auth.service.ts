import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/services/prisma.service';
import { UsersService } from '../../users/services/users.service';
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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (existingOtp) {
      await this.prisma.otpCode.update({
        where: { id: existingOtp.id },
        data: {
          code,
          expiresAt,
          attempts: existingOtp.attempts + 1,
        },
      });
    } else {
      await this.prisma.otpCode.create({
        data: {
          phone,
          code,
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

    if (!otp || otp.code !== code) {
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
      user,
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
      user,
      ...tokens,
    };
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

      const tokenExists = user.refreshTokens.find(
        (rt) => rt.token === refreshToken && !rt.revoked,
      );

      if (!tokenExists) throw new UnauthorizedException();

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
        token: refreshToken,
        hashedToken: hashedRefreshToken,
        expiresAt,
      },
    });
  }
}
