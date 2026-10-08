import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger.
 *
 * Jobs :
 * - heartbeat : sonde infra
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
