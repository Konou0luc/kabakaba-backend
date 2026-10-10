import { Module } from '@nestjs/common';
import { InternalCronController } from './controllers/internal-cron.controller';
import { ScheduledOrdersModule } from '../scheduled-orders/scheduled-orders.module';

@Module({
  imports: [ScheduledOrdersModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
