import { Module } from '@nestjs/common';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { FcmService } from './services/fcm.service';
import { VendorNotificationsService } from './services/vendor-notifications.service';
import { SchedulingRemindersService } from './services/scheduling-reminders.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FcmService, VendorNotificationsService, SchedulingRemindersService],
  exports: [NotificationsService, VendorNotificationsService, SchedulingRemindersService],
})
export class NotificationsModule {}
