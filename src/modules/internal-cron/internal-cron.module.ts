import { Module } from '@nestjs/common';
import { AmbassadorsModule } from '../ambassadors/ambassadors.module';
import { InternalCronController } from './controllers/internal-cron.controller';

@Module({
  imports: [AmbassadorsModule],
  controllers: [InternalCronController],
})
export class InternalCronModule {}
