import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class WebVerify2faSetupDto {
  @ApiProperty({ example: '482913', description: 'Code à 6 chiffres actuellement affiché dans Google Authenticator' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
