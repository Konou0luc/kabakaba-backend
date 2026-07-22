import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class WebVerify2faDto {
  @ApiProperty({ description: 'Jeton de challenge renvoyé par POST /web-auth/login' })
  @IsNotEmpty()
  @IsString()
  challengeToken: string;

  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres (Google Authenticator) ou clé de secours' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
