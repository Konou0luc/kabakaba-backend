import { Module } from '@nestjs/common';
import { AmbassadorsModule } from '../ambassadors/ambassadors.module';
import { OrdersModule } from '../orders/orders.module';
import { InternalCronController } from './controllers/internal-cron.controller';

@Module({
  imports: [AmbassadorsModule, OrdersModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
