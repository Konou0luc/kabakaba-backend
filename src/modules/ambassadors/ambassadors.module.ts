import { Module } from '@nestjs/common';
import { AmbassadorsController } from './controllers/ambassadors.controller';
import { AmbassadorsService } from './services/ambassadors.service';

@Module({
  controllers: [AmbassadorsController],
  providers: [AmbassadorsService],
  exports: [AmbassadorsService],
})
export class AmbassadorsModule {}
