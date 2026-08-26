import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsPhoneNumber, IsString, MinLength } from 'class-validator';

/**
 * Informations personnelles de la personne qui détient physiquement la
 * cantine — deviennent des attributs du User sous-jacent (role=VENDOR),
 * jamais du Vendor lui-même. Voir aussi UpdateVendorDto : ces champs ne
 * sont volontairement pas modifiables via l'endpoint de mise à jour de la
 * cantine.
 */
export class CreateVendorPersonDto {
  @ApiProperty({ example: 'Akosua', description: 'Prénom du vendeur' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Mensah', description: 'Nom de famille du vendeur' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

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
}
