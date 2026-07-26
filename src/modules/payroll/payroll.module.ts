import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PayrollController } from './controllers/payroll.controller';
import { WithdrawalsController } from './controllers/withdrawals.controller';
import { PayrollService } from './services/payroll.service';
import { WithdrawalsService } from './services/withdrawals.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { FedapayService } from '../payments/services/fedapay.service';

@Module({
  imports: [AnalyticsModule, HttpModule],
  controllers: [PayrollController, WithdrawalsController],
  providers: [PayrollService, WithdrawalsService, FedapayService],
  exports: [WithdrawalsService],
})
export class PayrollModule {}