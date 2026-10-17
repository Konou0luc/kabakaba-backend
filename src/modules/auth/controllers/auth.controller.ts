import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { GetCurrentUserId } from '../../../common/decorators/get-current-user.decorator';
import { assertMobileCookieCsrf } from '../../../common/guards/assert-mobile-csrf';
import {
  clearAllMobileSessionCookies,
  clearMobileSessionCookies,
  getMobileCsrfCookie,
  getMobileRefreshCookie,
  issueMobileSessionCookies,
  mobileAppFromRequest,
} from '../../../common/utils/mobile-session-cookie';
import type { Request, Response } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Envoyer un code OTP au numéro de téléphone' })
  @ApiResponse({ status: 200, description: 'Code OTP envoyé avec succès.' })
  sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Vérifier le code OTP étudiant (inscription ou pose du PIN)',
  })
  @ApiResponse({
    status: 200,
    description: 'Étudiant : stage PIN_SETUP_REQUIRED + pinSetupToken.',
  })
  verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Renouveler la session à partir du cookie HttpOnly' })
  @ApiResponse({ status: 200, description: 'Cookies de session renouvelés.' })
  async refreshTokens(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertMobileCookieCsrf(req);
    const app = mobileAppFromRequest(req);
    const refreshToken = app ? getMobileRefreshCookie(req, app) : null;
    if (!app || !refreshToken) {
      throw new UnauthorizedException('Session expirée');
    }
    const tokens = await this.authService.refreshTokens(refreshToken);
    const csrfToken = issueMobileSessionCookies(res, app, tokens.accessToken, tokens.refreshToken);
    return { success: true, csrfToken };
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Relire le jeton CSRF déjà posé pour la PWA (réponse lisible uniquement par une origine autorisée)' })
  csrf(@Req() req: Request) {
    const app = mobileAppFromRequest(req);
    const csrfToken = app ? getMobileCsrfCookie(req, app) : null;
    if (!csrfToken) throw new UnauthorizedException('Session expirée');
    return { csrfToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Déconnecter l'utilisateur" })
  @ApiResponse({ status: 200, description: 'Déconnexion réussie.' })
  logout(
    @GetCurrentUserId() userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const app = mobileAppFromRequest(req);
    if (app) clearMobileSessionCookies(res, app);
    else clearAllMobileSessionCookies(res);
    return this.authService.logout(userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Changer son mot de passe (requis après une première connexion avec un mot de passe temporaire)',
  })
  @ApiResponse({ status: 200, description: 'Mot de passe changé avec succès.' })
  @ApiResponse({ status: 401, description: 'Mot de passe actuel incorrect.' })
  changePassword(
    @GetCurrentUserId() userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
  }
}
