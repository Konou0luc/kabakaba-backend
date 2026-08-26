import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVendorPersonDto } from './create-vendor-person.dto';
import { CreateCanteenDto } from './create-canteen.dto';

/**
 * Correspond au formulaire "Créer une cantine" du dashboard web : l'admin
 * saisit d'un côté les informations personnelles du vendeur (compte User,
 * role=VENDOR) et de l'autre les informations publiques de la cantine
 * (Vendor). Les deux sont créés dans la même opération — voir
 * VendorsService.create() — mais explicitement séparés ici pour ne pas
 * mélanger "qui détient la cantine" et "ce qu'est la cantine".
 */
export class CreateVendorDto {
  @ApiProperty({ type: CreateVendorPersonDto })
  @ValidateNested()
  @Type(() => CreateVendorPersonDto)
  vendor: CreateVendorPersonDto;

  @ApiProperty({ type: CreateCanteenDto })
  @ValidateNested()
  @Type(() => CreateCanteenDto)
  canteen: CreateCanteenDto;
}
