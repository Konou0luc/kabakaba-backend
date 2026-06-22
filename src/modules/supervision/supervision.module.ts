import { Module } from '@nestjs/common';
import { SupervisionController } from './controllers/supervision.controller';
import { SupervisionService } from './services/supervision.service';

@Module({
  controllers: [SupervisionController],
  providers: [SupervisionService]
})
export class SupervisionModule {}
