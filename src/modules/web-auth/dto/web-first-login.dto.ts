import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class WebFirstLoginDto {
  @ApiProperty({ example: 'a.dossou@kabakaba.app' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Xk7mPq2wRt', description: 'Mot de passe temporaire transmis par un administrateur' })
  @IsString()
  @IsNotEmpty()
  temporaryPassword: string;
}
