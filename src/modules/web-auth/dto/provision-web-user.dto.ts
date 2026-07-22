import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { WebUserRole } from '@prisma/client';

/**
 * Aucune page de la maquette ne crée de WebUser aujourd'hui (pas d'écran
 * "Équipe" mocké) — mais sans un moyen d'en créer, le système d'auth est
 * inutilisable. Le tout premier compte (root, protégé) doit être créé hors
 * API (seed / accès direct DB) : on ne peut pas s'authentifier avant qu'un
 * compte existe. Celui-ci sert à onboarder les suivants une fois qu'un
 * membre de la Supervision est connecté — seule la Supervision crée des
 * comptes WebUser (SUPERVISION ou ADMIN), c'est elle qui décide qui a accès
 * à quelle interface.
 */
export class ProvisionWebUserDto {
  @ApiProperty({ example: 'Ama' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dossou' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'a.dossou@kabakaba.app' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ enum: WebUserRole, description: 'Détermine l\'interface accessible : SUPERVISION ou ADMIN' })
  @IsNotEmpty()
  @IsEnum(WebUserRole)
  role: WebUserRole;

  @ApiProperty({ example: '+22890000000', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Xk7mPq2wRt', minLength: 8, description: 'Mot de passe temporaire à transmettre au nouvel utilisateur' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  temporaryPassword: string;
}
