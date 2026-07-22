import { Module } from '@nestjs/common';
import { DisputesController } from './controllers/disputes.controller';
import { DisputesService } from './services/disputes.service';

@Module({
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
