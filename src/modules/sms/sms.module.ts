import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SmsService } from './services/sms.service';

@Module({
  imports: [HttpModule],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
