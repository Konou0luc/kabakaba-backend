import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { DistributedThrottlerStorage } from './common/throttling/distributed-throttler.storage';
import { PrismaService } from './database/services/prisma.service';
import { AppController } from './app.controller';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CampusesModule } from './modules/campuses/campuses.module';
import { VendorsModule } from './modules/vendors/vendors.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ComponentsModule } from './modules/components/components.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { SmsModule } from './modules/sms/sms.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { PartnerApplicationsModule } from './modules/partner-applications/partner-applications.module';
import { WebAuthModule } from './modules/web-auth/web-auth.module';
import { InternalCronModule } from './modules/internal-cron/internal-cron.module';
import { DevicesModule } from './modules/devices/devices.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Rate limiting distribué : les compteurs sont stockés en PostgreSQL afin
    // que toutes les instances Vercel partagent le même état. Les endpoints
    // sensibles conservent leurs limites @Throttle plus strictes.
    ThrottlerModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
        storage: new DistributedThrottlerStorage(prisma),
      }),
    }),
    DatabaseModule,
    AuthModule,
    AnalyticsModule,
    UsersModule,
    CampusesModule,
    VendorsModule,
    CatalogModule,
    ComponentsModule,
    OrdersModule,
    PaymentsModule,
    TransactionsModule,
    ReviewsModule,
    NotificationsModule,
    AdminModule,
    SmsModule,
    DisputesModule,
    PartnerApplicationsModule,
    WebAuthModule,
    InternalCronModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}