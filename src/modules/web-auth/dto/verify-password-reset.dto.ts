import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class StartPasswordResetDto {
  @ApiProperty({ example: 'directeur@kabakaba.app' })
  @IsNotEmpty()
  @IsEmail()
  email: string;
}

export class VerifyPasswordResetDto {
  @ApiProperty({ example: 'directeur@kabakaba.app' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '482913', description: 'Code SMS à 6 chiffres envoyé au téléphone du compte' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  smsCode: string;

  @ApiProperty({ example: '482913', description: 'Code TOTP à 6 chiffres ou clé de secours' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
