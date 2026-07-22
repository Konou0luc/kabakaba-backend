import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';

/**
 * Correspond au formulaire "Créer une cantine" du dashboard web : l'admin ne
 * fournit jamais de userId existant, il saisit les informations du vendeur et
 * ses identifiants de connexion. Le compte User (role=VENDOR) est créé dans
 * la même opération que le Vendor — voir VendorsService.create().
 */
export class CreateVendorDto {
  @ApiProperty({ example: 'Cantine du Bloc A', description: 'Nom de la cantine' })
  @IsNotEmpty()
  @IsString()
  canteenName: string;

  @ApiProperty({ example: 'Akosua Mensah', description: 'Nom complet du vendeur ("Prénom NOM")' })
  @IsNotEmpty()
  @IsString()
  vendorName: string;

  @ApiProperty({ example: '+22890000000', description: 'Téléphone de contact du vendeur' })
  @IsNotEmpty()
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: 'vendeur@kabakaba.app', description: 'Email de connexion du vendeur' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Xk7mPq2wRt',
    minLength: 8,
    description: 'Mot de passe temporaire transmis au vendeur — il devra le changer à sa première connexion',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  temporaryPassword: string;

  @ApiProperty({
    example: ['campus-uuid-1', 'campus-uuid-2'],
    description: 'Campus où cette cantine sera visible (au moins un requis)',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  campusIds: string[];

  @ApiProperty({ example: 'https://cdn.kabakaba.app/logo.jpg', required: false, description: 'Photo de profil / logo de la cantine' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ example: 'https://cdn.kabakaba.app/banniere.jpg', required: false, description: 'Bannière affichée sur la fiche cantine' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiProperty({ example: 'Restaurant universitaire spécialisé dans la cuisine traditionnelle', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: false, default: false, required: false })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}
