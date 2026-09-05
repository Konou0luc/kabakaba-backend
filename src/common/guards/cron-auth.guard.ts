import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Protège les endpoints internes déclenchés par un cron externe (GitHub
 * Actions) plutôt que par un utilisateur authentifié : aucune session JWT
 * n'existe côté appelant, donc pas de JwtAuthGuard possible ici.
 *
 * Authentification par secret partagé transmis dans le header
 * `x-cron-secret`, comparé en temps constant à CRON_SECRET.
 *
 * Fail-CLOSED : si CRON_SECRET n'est pas configuré côté serveur, la requête
 * est rejetée plutôt qu'acceptée en silence — même logique que
 * FEDAPAY_WEBHOOK_SECRET dans fedapay.service.ts. Un endpoint qui déclenche
 * des mouvements d'argent (recalcul de commissions, timeouts de commandes)
 * ne doit jamais être exécutable sans vérification possible.
 */
@Injectable()
export class CronAuthGuard implements CanActivate {
  private readonly logger = new Logger(CronAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      this.logger.error('CRON_SECRET non configuré : endpoint cron refusé (fail-closed).');
      throw new InternalServerErrorException('Configuration serveur incomplète : endpoint cron désactivé');
    }

    const provided = request.headers['x-cron-secret'];
    if (!provided || typeof provided !== 'string') {
      throw new UnauthorizedException('Secret cron manquant');
    }

    const expected = Buffer.from(secret);
    const actual = Buffer.from(provided);

    const isValid =
      expected.length === actual.length && crypto.timingSafeEqual(expected, actual);

    if (!isValid) {
      throw new UnauthorizedException('Secret cron invalide');
    }

    return true;
  }
}
