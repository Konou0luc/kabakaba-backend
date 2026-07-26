import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyticsModule } from './modules/analytics/analytics.module';
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
import { DisputesModule } from './modules/disputes/disputes.module';
import { PartnerApplicationsModule } from './modules/partner-applications/partner-applications.module';
import { WebAuthModule } from './modules/web-auth/web-auth.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PayrollModule } from './modules/payroll/payroll.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Limite globale par défaut : 60 requêtes/minute/IP. Les endpoints
    // sensibles (login, 2FA, OTP) ont une limite plus stricte via @Throttle
    // directement sur leurs contrôleurs.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }]),
    ScheduleModule.forRoot(),
    PayrollModule,
    DatabaseModule,
    AuthModule,
    AnalyticsModule,
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
    DisputesModule,
    PartnerApplicationsModule,
    WebAuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}