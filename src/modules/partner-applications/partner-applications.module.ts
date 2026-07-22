import { Module } from '@nestjs/common';
import { PartnerApplicationsController } from './controllers/partner-applications.controller';
import { PartnerApplicationsService } from './services/partner-applications.service';

@Module({
  controllers: [PartnerApplicationsController],
  providers: [PartnerApplicationsService],
})
export class PartnerApplicationsModule {}
