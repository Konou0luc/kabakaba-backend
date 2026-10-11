import { Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { CronAuthGuard } from '../../../common/guards/cron-auth.guard';
import { ScheduledOrdersService } from '../../scheduled-orders/services/scheduled-orders.service';
import { UnclaimedOrdersService } from '../../orders/services/unclaimed-orders.service';
import { SchedulingRemindersService } from '../../notifications/services/scheduling-reminders.service';

/**
 * Endpoints déclenchés par les workflows GitHub Actions (voir
 * .github/workflows/), pas par un client de l'application. Exclu de Swagger.
 *
 * Jobs :
 * - heartbeat : sonde infra
 * - scheduled-orders : exécution des commandes programmées arrivées à l'heure prévue
 * - unclaimed-orders : signalement des commandes restées « Prêtes » au-delà du délai
 * - scheduling-reminders : rappel « Programme ton repas » aux étudiants actifs, tous les 3 jours
 */
@ApiExcludeController()
@Controller('internal/cron')
@UseGuards(CronAuthGuard)
export class InternalCronController {
  private readonly logger = new Logger(InternalCronController.name);

  constructor(
    private readonly scheduledOrders: ScheduledOrdersService,
    private readonly unclaimedOrders: UnclaimedOrdersService,
    private readonly schedulingReminders: SchedulingRemindersService,
  ) {}

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

  @Post('unclaimed-orders')
  async flagUnclaimedOrders() {
    const flagged = await this.unclaimedOrders.flagUnclaimed();
    this.logger.log(`Commandes non récupérées : ${flagged} signalée(s)`);
    return { ok: true, flagged };
  }

  @Post('scheduling-reminders')
  async sendSchedulingReminders() {
    const sent = await this.schedulingReminders.sendDueReminders();
    this.logger.log(`Rappels de programmation : ${sent} envoyé(s)`);
    return { ok: true, sent };
  }
}
