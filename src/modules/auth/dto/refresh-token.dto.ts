import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'refresh_token_here',
    description:
      'Jeton de renouvellement — requis pour les apps Flutter (Bearer). La PWA utilise le cookie HttpOnly.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
