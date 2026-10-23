import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { issueMobileSessionCookies } from '../../../common/utils/mobile-session-cookie';
import { StudentAuthService } from '../services/student-auth.service';
import { StudentSetPinDto } from '../dto/student-set-pin.dto';
import { StudentLoginPinDto } from '../dto/student-login-pin.dto';

@ApiTags('Auth — Étudiant')
@Controller('auth/student')
export class StudentAuthController {
  constructor(private readonly studentAuthService: StudentAuthService) {}

  @Public()
  @Post('set-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Après OTP — enregistre le code PIN (4 chiffres) et ouvre la session étudiant',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN enregistré, session ouverte dans un cookie HttpOnly.',
  })
  @ApiResponse({ status: 400, description: 'Code PIN trop simple.' })
  @ApiResponse({ status: 401, description: 'Jeton d’étape invalide ou expiré.' })
  async setPin(@Body() dto: StudentSetPinDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.studentAuthService.setPin(dto);
    const csrfToken = issueMobileSessionCookies(res, 'student', result.accessToken, result.refreshToken);
    return { ...result, csrfToken };
  }

  @Public()
  @Post('login-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @ApiOperation({
    summary: 'Connexions suivantes — téléphone + code PIN (sans SMS)',
  })
  @ApiResponse({ status: 200, description: 'Connexion réussie, session ouverte dans un cookie HttpOnly.' })
  @ApiResponse({ status: 401, description: 'Code PIN invalide.' })
  @ApiResponse({
    status: 403,
    description: 'PIN temporairement verrouillé après trop d’échecs.',
  })
  async loginPin(@Body() dto: StudentLoginPinDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.studentAuthService.loginPin(dto);
    const csrfToken = issueMobileSessionCookies(res, 'student', result.accessToken, result.refreshToken);
    return { ...result, csrfToken };
  }
}
