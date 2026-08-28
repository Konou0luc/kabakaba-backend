import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class VerifyPasswordResetDto {
  @ApiProperty({ example: 'directeur@kabakaba.app' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913', description: 'Code TOTP à 6 chiffres ou clé de secours' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
