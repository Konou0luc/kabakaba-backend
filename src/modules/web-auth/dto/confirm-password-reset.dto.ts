import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @ApiProperty({ description: 'Jeton renvoyé par POST /web-auth/password-reset/verify' })
  @IsNotEmpty()
  @IsString()
  resetSessionToken: string;

  @ApiProperty({ example: 'MonNouveauMotDePasse!2026', minLength: 12 })
  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  newPassword: string;
}
