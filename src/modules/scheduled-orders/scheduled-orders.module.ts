import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ScheduledOrdersController } from './controllers/scheduled-orders.controller';
import { ScheduledOrdersService } from './services/scheduled-orders.service';

@Module({
  imports: [OrdersModule, NotificationsModule],
  controllers: [ScheduledOrdersController],
  providers: [ScheduledOrdersService],
  exports: [ScheduledOrdersService],
})
export class ScheduledOrdersModule {}
