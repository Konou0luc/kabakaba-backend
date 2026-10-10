import { Module } from '@nestjs/common';
import { InternalCronController } from './controllers/internal-cron.controller';
import { ScheduledOrdersModule } from '../scheduled-orders/scheduled-orders.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [ScheduledOrdersModule, OrdersModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
