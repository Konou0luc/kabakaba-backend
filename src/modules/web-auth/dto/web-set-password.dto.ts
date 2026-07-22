import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class WebSetPasswordDto {
  @ApiProperty({ example: 'MonMotDePasse!2026', minLength: 12, description: 'Nouveau mot de passe personnel (remplace le mot de passe temporaire)' })
  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  newPassword: string;
}
