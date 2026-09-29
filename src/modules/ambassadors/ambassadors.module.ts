import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AmbassadorsController } from './controllers/ambassadors.controller';
import { AmbassadorsService } from './services/ambassadors.service';

@Module({
  imports: [MediaModule, NotificationsModule],
  controllers: [AmbassadorsController],
  providers: [AmbassadorsService],
  exports: [AmbassadorsService],
})
export class AmbassadorsModule {}
