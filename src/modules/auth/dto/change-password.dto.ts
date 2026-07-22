import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Xk7mPq2wRt', description: 'Mot de passe actuel (temporaire ou non)' })
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ example: 'MonMotDePasse!2026', minLength: 8, description: 'Nouveau mot de passe personnel' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}
