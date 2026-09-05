import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger
 * (ApiExcludeController) : ce ne sont pas des routes métier, et les
 * documenter reviendrait à publier la liste des tâches planifiées et leur
 * forme à quiconque consulte /docs.
 *
 * Chaque job métier (timeout commandes à 5 min, auto-réception à 1h,
 * recalcul quotidien des commissions ambassadeur) sera ajouté ici comme un
 * endpoint dédié, une fois cette brique validée en production.
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronAuthGuard)
export class InternalCronController {
  private readonly logger = new Logger(InternalCronController.name);

  @Post('heartbeat')
  heartbeat() {
    const timestamp = new Date().toISOString();
    this.logger.log(`Heartbeat cron reçu à ${timestamp}`);
    return { ok: true, timestamp };
  }
}
