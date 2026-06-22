import { Module } from '@nestjs/common';
import { AbuseController } from './controllers/abuse.controller';
import { AbuseService } from './services/abuse.service';

@Module({
  controllers: [AbuseController],
  providers: [AbuseService]
})
export class AbuseModule {}
