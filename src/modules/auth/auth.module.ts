import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './controllers/auth.controller';
import { VendorAuthController } from './controllers/vendor-auth.controller';
import { StudentAuthController } from './controllers/student-auth.controller';
import { AuthService } from './services/auth.service';
import { VendorAuthService } from './services/vendor-auth.service';
import { StudentAuthService } from './services/student-auth.service';
import { UsersModule } from '../users/users.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_ACCESS_SECRET'),
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    SmsModule,
    NotificationsModule,
  ],
  controllers: [AuthController, VendorAuthController, StudentAuthController],
  providers: [AuthService, VendorAuthService, StudentAuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
