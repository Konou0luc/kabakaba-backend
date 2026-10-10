import { Module } from '@nestjs/common';
import { ComponentsController } from './controllers/components.controller';
import { ComponentsService } from './services/components.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ComponentsController],
  providers: [ComponentsService],
})
export class ComponentsModule {}
