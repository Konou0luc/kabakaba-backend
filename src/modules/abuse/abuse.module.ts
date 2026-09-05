import { Module } from '@nestjs/common';
import { AbuseController } from './controllers/abuse.controller';
import { AbuseService } from './services/abuse.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AbuseController],
  providers: [AbuseService],
  exports: [AbuseService],
})
export class AbuseModule {}
