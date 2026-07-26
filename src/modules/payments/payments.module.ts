import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaymentsController } from './controllers/payments.controller';
import { PaymentsService } from './services/payments.service';
import { FedapayService } from './services/fedapay.service';
import { UsersModule } from '../users/users.module';
import { PayrollModule } from '../payroll/payroll.module';

@Module({
  imports: [HttpModule, UsersModule, PayrollModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, FedapayService],
})
export class PaymentsModule {}
