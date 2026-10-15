import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
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
    description: 'PIN enregistré, tokens de session renvoyés.',
  })
  @ApiResponse({ status: 400, description: 'Code PIN trop simple.' })
  @ApiResponse({ status: 401, description: 'Jeton d’étape invalide ou expiré.' })
  setPin(@Body() dto: StudentSetPinDto) {
    return this.studentAuthService.setPin(dto);
  }

  @Public()
  @Post('login-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @ApiOperation({
    summary: 'Connexions suivantes — téléphone + code PIN (sans SMS)',
  })
  @ApiResponse({ status: 200, description: 'Connexion réussie, tokens renvoyés.' })
  @ApiResponse({ status: 401, description: 'Code PIN invalide.' })
  @ApiResponse({
    status: 403,
    description: 'PIN temporairement verrouillé après trop d’échecs.',
  })
  loginPin(@Body() dto: StudentLoginPinDto) {
    return this.studentAuthService.loginPin(dto);
  }
}
