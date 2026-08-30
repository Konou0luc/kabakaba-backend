import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { WebUserRole } from '@prisma/client';

export class WebLoginDto {
  @ApiProperty({ example: 'prenom.nom@kabakaba.app' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'MonMotDePasse!2026' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    enum: WebUserRole,
    required: false,
    description:
      "Rôle attendu par l'espace visité (Supervision ou Admin web). Si fourni et différent du rôle réel du " +
      "compte, la connexion est refusée avec le même message générique qu'un mot de passe invalide — aucune " +
      'information sur le rôle réel du compte ne doit être déductible depuis la réponse.',
  })
  @IsOptional()
  @IsEnum(WebUserRole)
  expectedRole?: WebUserRole;
}
