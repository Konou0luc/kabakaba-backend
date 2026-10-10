import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';
import { ScheduledOrdersService } from '../../scheduled-orders/services/scheduled-orders.service';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger.
 *
 * Jobs :
 * - heartbeat : sonde infra
 * - scheduled-orders : exécution des commandes programmées arrivées à l'heure prévue
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronAuthGuard)
export class InternalCronController {
  private readonly logger = new Logger(InternalCronController.name);

  constructor(private readonly scheduledOrders: ScheduledOrdersService) {}

  @Post('heartbeat')
  heartbeat() {
    const timestamp = new Date().toISOString();
    this.logger.log(`Heartbeat cron reçu à ${timestamp}`);
    return { ok: true, timestamp };
  }

  @Post('scheduled-orders')
  async executeScheduledOrders() {
    const { placed, failed } = await this.scheduledOrders.executeDue();
    this.logger.log(`Commandes programmées : ${placed} passée(s), ${failed} échouée(s)`);
    return { ok: true, placed, failed };
  }
}
