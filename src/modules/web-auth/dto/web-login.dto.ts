import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class WebLoginDto {
  @ApiProperty({ example: 'prenom.nom@kabakaba.app' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'MonMotDePasse!2026' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
