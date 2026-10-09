import { Module } from '@nestjs/common';
import { VendorsController } from './controllers/vendors.controller';
import { VendorsService } from './services/vendors.service';
import { WithdrawalsController } from './controllers/withdrawals.controller';
import { WithdrawalsService } from './services/withdrawals.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [VendorsController, WithdrawalsController],
  providers: [VendorsService, WithdrawalsService],
  exports: [VendorsService],
})
export class VendorsModule {}
