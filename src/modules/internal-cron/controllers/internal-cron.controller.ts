import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';
import { AmbassadorsService } from '../../ambassadors/services/ambassadors.service';
import { OrdersService } from '../../orders/services/orders.service';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger.
 *
 * Jobs métier :
 * - heartbeat : sonde infra
 * - ambassador-daily : volume30d / level / suspension inactivité (CDC 10.3–10.5)
 * - orders-timeout : PENDING > 5 min + READY > 1 h (CDC 4.3 / 4.6)
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronAuthGuard)
export class InternalCronController {
  private readonly logger = new Logger(InternalCronController.name);

  constructor(
    private readonly ambassadorsService: AmbassadorsService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('heartbeat')
  heartbeat() {
    const timestamp = new Date().toISOString();
    this.logger.log(`Heartbeat cron reçu à ${timestamp}`);
    return { ok: true, timestamp };
  }

  @Post('ambassador-daily')
  async ambassadorDaily() {
    this.logger.log('Cron ambassador-daily démarré');
    const summary = await this.ambassadorsService.recalculateDailyStats();
    return { ok: true, ...summary };
  }

  /**
   * CDC 4.3 + 4.6 — à appeler fréquemment (ex. toutes les minutes).
   */
  @Post('orders-timeout')
  async ordersTimeout() {
    this.logger.log('Cron orders-timeout démarré');
    const pending = await this.ordersService.processPendingTimeouts();
    const autoReceive = await this.ordersService.processReadyAutoReceive();
    return { ok: true, pending, autoReceive };
  }
}
