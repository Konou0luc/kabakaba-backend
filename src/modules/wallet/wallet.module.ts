import { Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { WalletService } from './services/wallet.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [WalletController],
  providers: [WalletService],
})
export class WalletModule {}
