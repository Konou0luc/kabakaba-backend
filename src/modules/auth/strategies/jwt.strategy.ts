import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SuspensionStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      // Ne JAMAIS démarrer avec un secret par défaut connu de tous —
      // mieux vaut un crash au démarrage qu'une faille silencieuse.
      throw new Error('JWT_ACCESS_SECRET manquant — démarrage refusé pour des raisons de sécurité');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; role: string }) {
    let user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || user.isBanned) return null;

    // Suspension temporaire expirée → levée automatique (fonds dégelés).
    // Sans ça, un compte resterait bloqué après suspensionUntil jusqu'à
    // une action admin manuelle.
    if (user.isSuspended) {
      if (user.suspensionUntil && user.suspensionUntil.getTime() <= Date.now()) {
        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: user.id },
            data: {
              isSuspended: false,
              suspendedAt: null,
              suspensionUntil: null,
              suspensionReason: null,
            },
          }),
          this.prisma.suspensionEvent.updateMany({
            where: {
              studentId: user.id,
              status: SuspensionStatus.ACTIVE,
            },
            data: {
              status: SuspensionStatus.EXPIRED,
              liftedAt: new Date(),
            },
          }),
        ]);
        user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user || user.deletedAt || user.isBanned) return null;
      } else {
        // Encore sous suspension : accès refusé → fonds gelés côté API
        // (aucune commande / transfert / recharge possible).
        return null;
      }
    }

    return { ...user, __authKind: 'mobile' as const };
  }
}
