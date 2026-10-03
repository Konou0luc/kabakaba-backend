import { Module } from '@nestjs/common';
import { AbuseService } from './services/abuse.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [AbuseService],
  exports: [AbuseService],
})
export class AbuseModule {}
