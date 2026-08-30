import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { WebUserRole } from '@prisma/client';

export class WebFirstLoginDto {
  @ApiProperty({ example: 'a.dossou@kabakaba.app' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Xk7mPq2wRt', description: 'Mot de passe temporaire transmis par un administrateur' })
  @IsString()
  @IsNotEmpty()
  temporaryPassword: string;

  @ApiProperty({
    enum: WebUserRole,
    required: false,
    description: "Rôle attendu par l'espace visité — voir WebLoginDto pour le raisonnement complet.",
  })
  @IsOptional()
  @IsEnum(WebUserRole)
  expectedRole?: WebUserRole;
}
