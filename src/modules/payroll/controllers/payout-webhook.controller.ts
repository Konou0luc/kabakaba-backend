import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { WithdrawalsService } from '../services/withdrawals.service';

@ApiTags('Payments')
@Controller('payments')
export class PayoutWebhookController {
  constructor(private readonly withdrawalsService: WithdrawalsService) {}

  @Post('payout-webhook')
  @ApiOperation({
    summary: 'Webhook pour les notifications de statut de payout FedaPay',
  })
  async handlePayoutWebhook(@Body() webhookData: any) {
    const payout = webhookData?.event?.payout ?? webhookData?.payout;
    const eventType: string =
      webhookData?.event?.type ?? webhookData?.type ?? '';

    if (!payout?.id) return { message: 'Payload payout invalide, ignoré' };

    if (eventType.includes('sent') || payout.status === 'sent') {
      await this.withdrawalsService.handleFedapayPayoutStatus(
        String(payout.id),
        'sent',
      );
    } else if (eventType.includes('failed') || payout.status === 'failed') {
      await this.withdrawalsService.handleFedapayPayoutStatus(
        String(payout.id),
        'failed',
      );
    }

    return { message: 'Webhook payout traité' };
  }
}
