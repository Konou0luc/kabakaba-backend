import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/services/prisma.service';

@Injectable()
export class WebJwtStrategy extends PassportStrategy(Strategy, 'web-jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_WEB_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_WEB_ACCESS_SECRET manquant — démarrage refusé pour des raisons de sécurité');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; role: string; purpose: string; tokenVersion?: number }) {
    if (payload.purpose !== 'web_session') {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }

    const webUser = await this.prisma.webUser.findUnique({ where: { id: payload.sub } });
    if (!webUser || !webUser.isActive || webUser.deletedAt) {
      throw new UnauthorizedException();
    }

    // Un mot de passe réinitialisé incrémente tokenVersion : tout jeton émis
    // avant ce moment devient automatiquement invalide, sur tous les
    // appareils, dès la requête suivante — sans avoir besoin d'une table de
    // sessions active à interroger.
    if (payload.tokenVersion !== webUser.tokenVersion) {
      throw new UnauthorizedException('Session invalidée — veuillez vous reconnecter');
    }

    const { password, twoFaSecret, ...safeWebUser } = webUser;

    return { ...safeWebUser, __authKind: 'web' as const };
  }
}