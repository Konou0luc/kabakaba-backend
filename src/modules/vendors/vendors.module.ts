import { Module } from '@nestjs/common';
import { VendorsController } from './controllers/vendors.controller';
import { VendorsService } from './services/vendors.service';
import { VendorSchedulesController } from './schedules/controllers/vendor-schedules.controller';
import { VendorSchedulesService } from './schedules/services/vendor-schedules.service';
import { WithdrawalsController } from './controllers/withdrawals.controller';
import { WithdrawalsService } from './services/withdrawals.service';

@Module({
  controllers: [VendorsController, VendorSchedulesController, WithdrawalsController],
  providers: [VendorsService, VendorSchedulesService, WithdrawalsService],
  exports: [VendorsService, WithdrawalsService],
})
export class VendorsModule {}
