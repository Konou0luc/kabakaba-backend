import { Module } from '@nestjs/common';
import { VendorsController } from './controllers/vendors.controller';
import { VendorsService } from './services/vendors.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService]
})
export class VendorsModule {}
