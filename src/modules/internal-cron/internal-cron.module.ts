import { Module } from '@nestjs/common';
import { InternalCronController } from './controllers/internal-cron.controller';

@Module({
  controllers: [InternalCronController],
})
export class InternalCronModule {}
