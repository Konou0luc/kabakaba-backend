import { Module } from '@nestjs/common';
import { InternalCronController } from './controllers/internal-cron.controller';
import { ScheduledOrdersModule } from '../scheduled-orders/scheduled-orders.module';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ScheduledOrdersModule, OrdersModule, NotificationsModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
