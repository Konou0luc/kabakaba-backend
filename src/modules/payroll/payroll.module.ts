import { Module } from '@nestjs/common';
import { PayrollController } from './controllers/payroll.controller';
import { PayrollService } from './services/payroll.service';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [AnalyticsModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}