import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, MinLength, IsBoolean } from 'class-validator';

/**
 * DTO de l'auto-inscription PUBLIQUE (POST /users). Le champ `role`
 * n'existe volontairement pas ici : il est toujours forcé à STUDENT côté
 * service, jamais pris depuis le client. Pour créer un compte ADMIN/VENDOR,
 * voir CreateStaffUserDto (endpoint gardé POST /users/staff).
 */
export class CreateUserDto {
  @ApiProperty({ example: '+22890000000', required: false, description: 'Numéro de téléphone' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiProperty({ example: 'student@univ.tg', required: false, description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'password123', minLength: 6, required: false, description: 'Mot de passe (minimum 6 caractères)' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'Jean', description: 'Prénom' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dupont', description: 'Nom de famille' })
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg', required: false, description: "URL de l'avatar" })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ example: 'uuid-campus', required: false, description: 'Identifiant du campus' })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ default: true, description: 'Recevoir des notifications pour les commandes' })
  @IsOptional()
  @IsBoolean()
  notifyOrders?: boolean;

  @ApiProperty({ default: true, description: 'Recevoir des notifications pour le programme ambassadeur' })
  @IsOptional()
  @IsBoolean()
  notifyAmbassador?: boolean;

  @ApiProperty({ default: false, description: 'Recevoir des notifications pour les promotions' })
  @IsOptional()
  @IsBoolean()
  notifyPromotions?: boolean;
}