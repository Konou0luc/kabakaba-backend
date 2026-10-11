import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { FcmService } from './services/fcm.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
