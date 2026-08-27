import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebAuthController } from './controllers/web-auth.controller';
import { WebUsersController } from './controllers/web-users.controller';
import { WebAuthService } from './services/web-auth.service';
import { WebUsersService } from './services/web-users.service';
import { WebJwtStrategy } from './strategies/web-jwt.strategy';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule,
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_WEB_ACCESS_SECRET');
        if (!secret) {
          // Fail-closed : jamais de secret par défaut pour le JWT du
          // dashboard web (admin/supervision/paiements/litiges).
          throw new Error('JWT_WEB_ACCESS_SECRET manquant : démarrage refusé.');
        }
        return { secret };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [WebAuthController, WebUsersController],
  providers: [WebAuthService, WebUsersService, WebJwtStrategy],
  exports: [WebAuthService, WebUsersService],
})
export class WebAuthModule {}
