import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsPhoneNumber, IsString, IsBoolean } from 'class-validator';

/**
 * Champs de profil repris par UpdateUserDto. Il n'y a plus d'inscription
 * publique : un étudiant est créé uniquement après OTP (verifyOtp).
 * Le mot de passe n'est pas modifiable ici — uniquement via
 * POST /auth/change-password, qui exige le mot de passe actuel.
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

  @ApiProperty({ default: false, description: 'Recevoir des notifications pour les promotions' })
  @IsOptional()
  @IsBoolean()
  notifyPromotions?: boolean;
}