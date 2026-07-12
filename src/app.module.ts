import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CampusesModule } from './modules/campuses/campuses.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { AbuseModule } from './modules/abuse/abuse.module';
import { AmbassadorsModule } from './modules/ambassadors/ambassadors.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { SupervisionModule } from './modules/supervision/supervision.module';
import { SmsModule } from './modules/sms/sms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CampusesModule,
    VendorsModule,
    CatalogModule,
    OrdersModule,
    WalletModule,
    PaymentsModule,
    TransactionsModule,
    ReviewsModule,
    AbuseModule,
    AmbassadorsModule,
    NotificationsModule,
    AdminModule,
    SupervisionModule,
    SmsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
