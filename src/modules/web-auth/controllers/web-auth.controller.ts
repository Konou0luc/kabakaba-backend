import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WebAuthService } from '../services/web-auth.service';
import { WebLoginDto } from '../dto/web-login.dto';
import { WebVerify2faDto } from '../dto/web-verify-2fa.dto';
import { WebFirstLoginDto } from '../dto/web-first-login.dto';
import { WebSetPasswordDto } from '../dto/web-set-password.dto';
import { WebVerify2faSetupDto } from '../dto/web-verify-2fa-setup.dto';
import { WebUserEntity } from '../entities/web-user.entity';
import { extractBearerToken } from '../../../common/utils/extract-bearer-token';
import { WebJwtAuthGuard } from '../../../common/guards/web-jwt-auth.guard';

@ApiTags('Web Auth (dashboard admin/supervision)')
@Controller('web-auth')
export class WebAuthController {
  constructor(private readonly webAuthService: WebAuthService) {}

  // ─── Connexion normale : identifiants → 2FA ──────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Étape 1/2 de connexion : email + mot de passe → jeton de challenge 2FA' })
  @ApiResponse({ status: 200, description: 'Identifiants valides, code 2FA requis.' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides.' })
  @ApiResponse({ status: 409, description: 'Ce compte doit d\'abord terminer sa première connexion.' })
  login(@Body() dto: WebLoginDto) {
    return this.webAuthService.login(dto.email, dto.password);
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Étape 2/2 de connexion : code Google Authenticator (ou clé de secours) → session' })
  @ApiResponse({ status: 200, description: 'Connexion réussie, jeton de session renvoyé.' })
  @ApiResponse({ status: 401, description: 'Code invalide ou jeton de challenge expiré.' })
  verify2fa(@Body() dto: WebVerify2faDto) {
    return this.webAuthService.verify2fa(dto.challengeToken, dto.code);
  }

  // ─── Première connexion : mot de passe temporaire → onboarding ──

  @Post('first-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Étape 1/4 onboarding : vérifie le mot de passe temporaire → jeton d\'onboarding' })
  @ApiResponse({ status: 200, description: 'Mot de passe temporaire valide.' })
  @ApiResponse({ status: 401, description: 'Identifiants invalides.' })
  @ApiResponse({ status: 409, description: 'Ce compte a déjà terminé sa première connexion.' })
  firstLogin(@Body() dto: WebFirstLoginDto) {
    return this.webAuthService.firstLogin(dto.email, dto.temporaryPassword);
  }

  @Post('first-login/password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Étape 2/4 onboarding : définir le mot de passe personnel (Bearer = onboardingToken)' })
  @ApiResponse({ status: 200, description: 'Mot de passe mis à jour.' })
  setOnboardingPassword(@Headers('authorization') authorization: string, @Body() dto: WebSetPasswordDto) {
    const onboardingToken = extractBearerToken(authorization);
    return this.webAuthService.setOnboardingPassword(onboardingToken, dto.newPassword);
  }

  @Post('first-login/2fa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Étape 3/4 onboarding : génère le secret TOTP + QR code (Bearer = onboardingToken)' })
  @ApiResponse({ status: 200, description: 'QR code et clé manuelle générés.' })
  setupTwoFactor(@Headers('authorization') authorization: string) {
    const onboardingToken = extractBearerToken(authorization);
    return this.webAuthService.setupTwoFactor(onboardingToken);
  }

  @Post('first-login/2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Étape 4/4 onboarding : vérifie le code TOTP → active le 2FA et ouvre la session (Bearer = onboardingToken)' })
  @ApiResponse({ status: 200, description: 'Onboarding terminé, session ouverte, clé de secours affichée une seule fois.' })
  @ApiResponse({ status: 401, description: 'Code invalide.' })
  verifyTwoFactorSetup(@Headers('authorization') authorization: string, @Body() dto: WebVerify2faSetupDto) {
    const onboardingToken = extractBearerToken(authorization);
    return this.webAuthService.verifyTwoFactorSetup(onboardingToken, dto.code);
  }

  // ─── Session ──────────────────────────────────────────────────────

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(WebJwtAuthGuard)
  @ApiOperation({ summary: 'Profil du WebUser actuellement connecté' })
  @ApiResponse({ status: 200, description: 'Retourne le profil.', type: WebUserEntity })
  me(@Request() req) {
    return req.user;
  }
}
