import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Informations publiques de la cantine elle-même — deviennent des attributs
 * du Vendor, jamais du User (personne) qui la détient.
 */
export class CreateCanteenDto {
  @ApiProperty({ example: 'Cantine du Bloc A', description: 'Nom de la cantine' })
  @IsNotEmpty()
  @IsString()
  canteenName: string;

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
