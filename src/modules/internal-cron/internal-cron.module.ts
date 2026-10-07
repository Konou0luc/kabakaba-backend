import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { VendorsModule } from '../vendors/vendors.module';
import { InternalCronController } from './controllers/internal-cron.controller';

@Module({
  imports: [OrdersModule, VendorsModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
