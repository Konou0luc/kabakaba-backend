import { Module } from '@nestjs/common';
import { VendorsController } from './controllers/vendors.controller';
import { VendorsService } from './services/vendors.service';
import { VendorSchedulesController } from './schedules/controllers/vendor-schedules.controller';
import { VendorSchedulesService } from './schedules/services/vendor-schedules.service';

@Module({
  controllers: [VendorsController, VendorSchedulesController],
  providers: [VendorsService, VendorSchedulesService]
})
export class VendorsModule {}
