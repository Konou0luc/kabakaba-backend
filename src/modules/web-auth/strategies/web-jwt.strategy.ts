import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/services/prisma.service';

/**
 * Stratégie distincte de celle des User mobiles : secret de signature
 * différent (JWT_WEB_ACCESS_SECRET) pour qu'un token web ne puisse jamais
 * être rejoué contre les routes mobiles, et inversement — les deux espaces
 * d'authentification sont cryptographiquement cloisonnés.
 */
@Injectable()
export class WebJwtStrategy extends PassportStrategy(Strategy, 'web-jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_WEB_ACCESS_SECRET') || 'fallback-web-secret',
    });
  }

  async validate(payload: { sub: string; role: string; purpose: string }) {
    if (payload.purpose !== 'web_session') {
      throw new UnauthorizedException('Jeton invalide pour cette opération');
    }

    const webUser = await this.prisma.webUser.findUnique({ where: { id: payload.sub } });
    if (!webUser || !webUser.isActive) {
      throw new UnauthorizedException();
    }

    const { password, twoFaSecret, twoFaBackupCode, ...safeWebUser } = webUser;
    return safeWebUser;
  }
}
