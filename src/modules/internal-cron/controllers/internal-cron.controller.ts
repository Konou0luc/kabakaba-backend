import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';
import { AmbassadorsService } from '../../ambassadors/services/ambassadors.service';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger
 * (ApiExcludeController) : ce ne sont pas des routes métier, et les
 * documenter reviendrait à publier la liste des tâches planifiées et leur
 * forme à quiconque consulte /docs.
 *
 * Jobs métier :
 * - heartbeat : sonde infra
 * - ambassador-daily : recalcul volume30d / level / suspension inactivité (CDC 10.3–10.5)
 * - (futurs) timeout commandes 5 min, auto-réception 1 h
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronAuthGuard)
export class InternalCronController {
  private readonly logger = new Logger(InternalCronController.name);

  constructor(private readonly ambassadorsService: AmbassadorsService) {}

  @Post('heartbeat')
  heartbeat() {
    const timestamp = new Date().toISOString();
    this.logger.log(`Heartbeat cron reçu à ${timestamp}`);
    return { ok: true, timestamp };
  }

  /**
   * CDC 10.3 / 10.5 — à appeler une fois par jour (GitHub Actions schedule).
   * Recalcule volume30d, met à jour les niveaux, avertit / suspend pour inactivité.
   */
  @Post('ambassador-daily')
  async ambassadorDaily() {
    this.logger.log('Cron ambassador-daily démarré');
    const summary = await this.ambassadorsService.recalculateDailyStats();
    return { ok: true, ...summary };
  }
}
