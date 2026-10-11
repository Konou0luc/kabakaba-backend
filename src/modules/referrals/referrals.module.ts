import { Module } from '@nestjs/common';
import { ReferralsController } from './controllers/referrals.controller';
import { ReferralsService } from './services/referrals.service';

@Module({
  controllers: [ReferralsController],
  providers: [ReferralsService],
})
export class ReferralsModule {}
