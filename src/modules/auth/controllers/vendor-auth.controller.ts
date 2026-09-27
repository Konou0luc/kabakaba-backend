import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { VendorAuthService } from '../services/vendor-auth.service';
import { VendorActivateStartDto } from '../dto/vendor-activate-start.dto';
import { VendorActivateVerifyOtpDto } from '../dto/vendor-activate-verify-otp.dto';
import { VendorSetPinDto } from '../dto/vendor-set-pin.dto';
import { VendorLoginPinDto } from '../dto/vendor-login-pin.dto';
import { VendorResendOtpDto } from '../dto/vendor-resend-otp.dto';
import { Public } from '../../../common/decorators/public.decorator';

@ApiTags('Auth vendeur (mobile)')
@Controller('auth/vendor')
export class VendorAuthController {
  constructor(private readonly vendorAuthService: VendorAuthService) {}

  @Public()
  @Post('activate/start')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Étape 1 — téléphone + mot de passe du compte vendeur, puis envoi du code OTP par SMS',
  })
  @ApiResponse({
    status: 200,
    description: "OTP envoyé, jeton d'étape renvoyé.",
  })
  @ApiResponse({ status: 401, description: 'Numéro ou mot de passe invalide.' })
  activateStart(@Body() dto: VendorActivateStartDto) {
    return this.vendorAuthService.activateStart(dto);
  }

  @Public()
  @Post('activate/resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Renvoyer le code OTP de l’étape en cours' })
  @ApiResponse({ status: 200, description: 'Nouveau code OTP envoyé.' })
  activateResendOtp(@Body() dto: VendorResendOtpDto) {
    return this.vendorAuthService.resendActivationOtp(dto);
  }

  @Public()
  @Post('activate/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Étape 2 — vérification du code OTP reçu par SMS' })
  @ApiResponse({
    status: 200,
    description: 'OTP validé, jeton de pose du PIN renvoyé.',
  })
  activateVerifyOtp(@Body() dto: VendorActivateVerifyOtpDto) {
    return this.vendorAuthService.activateVerifyOtp(dto);
  }

  @Public()
  @Post('activate/set-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Étape 3 — création du code PIN et ouverture de la session vendeur',
  })
  @ApiResponse({
    status: 200,
    description: 'PIN enregistré, tokens de session renvoyés.',
  })
  @ApiResponse({ status: 400, description: 'Code PIN trop simple.' })
  activateSetPin(@Body() dto: VendorSetPinDto) {
    return this.vendorAuthService.setPin(dto);
  }

  @Public()
  @Post('login-pin')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Connexions suivantes — téléphone + code PIN' })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie, tokens renvoyés.',
  })
  @ApiResponse({ status: 401, description: 'Code PIN invalide.' })
  @ApiResponse({
    status: 403,
    description: 'PIN temporairement verrouillé après trop d’échecs.',
  })
  loginPin(@Body() dto: VendorLoginPinDto) {
    return this.vendorAuthService.loginPin(dto);
  }
}
