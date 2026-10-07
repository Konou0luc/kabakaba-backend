import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { InternalCronController } from './controllers/internal-cron.controller';

@Module({
  imports: [OrdersModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
