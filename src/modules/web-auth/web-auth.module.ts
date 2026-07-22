import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebAuthController } from './controllers/web-auth.controller';
import { WebUsersController } from './controllers/web-users.controller';
import { WebAuthService } from './services/web-auth.service';
import { WebUsersService } from './services/web-users.service';
import { WebJwtStrategy } from './strategies/web-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_WEB_ACCESS_SECRET') || 'fallback-web-secret',
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [WebAuthController, WebUsersController],
  providers: [WebAuthService, WebUsersService, WebJwtStrategy],
  exports: [WebAuthService, WebUsersService],
})
export class WebAuthModule {}
