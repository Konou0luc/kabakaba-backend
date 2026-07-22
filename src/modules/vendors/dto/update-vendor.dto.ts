import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Volontairement distinct de CreateVendorDto : les champs d'identité/de
 * connexion (email, phone, temporaryPassword) ne se modifient pas via cet
 * endpoint — ce sont des attributs du User sous-jacent, pas du profil vendeur.
 */
export class UpdateVendorDto {
  @ApiProperty({ example: 'Cantine du Bloc A', required: false })
  @IsOptional()
  @IsString()
  canteenName?: string;

  @ApiProperty({ example: 'https://cdn.kabakaba.app/logo.jpg', required: false, description: 'Photo de profil / logo de la cantine' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({ example: 'https://cdn.kabakaba.app/banniere.jpg', required: false, description: 'Bannière affichée sur la fiche cantine' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'Si fourni, remplace intégralement la liste des campus affiliés à cette cantine',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  campusIds?: string[];
}
