import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPasswordResetDto {
  @ApiProperty({ description: 'Jeton brut reçu dans le lien envoyé par email' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ example: '482913', description: 'Code TOTP à 6 chiffres ou clé de secours' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
