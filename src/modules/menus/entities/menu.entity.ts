import { ApiProperty } from '@nestjs/swagger';
import { ComponentUnit } from '@prisma/client';

export class MenuLineViewEntity {
  @ApiProperty({ example: 'component-uuid' })
  componentId: string;

  @ApiProperty({ example: 'Riz' })
  name: string;

  @ApiProperty({ enum: ComponentUnit })
  unit: ComponentUnit;

  @ApiProperty({ example: 1 })
  quantity: number;
}

export class MissingComponentEntity {
  @ApiProperty({ example: 'component-uuid' })
  id: string;

  @ApiProperty({ example: 'Poulet' })
  name: string;
}

// Vue publique (étudiants) : jamais de quantité de stock.
export class PublicMenuEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Menu Poulet spécial' })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  description: string | null;

  @ApiProperty({ example: 2000, description: 'Somme des quantités de ligne × prix des composants, calculée à la lecture' })
  priceTickets: number;

  @ApiProperty({ example: true, description: 'Menu actif et tous ses composants disponibles en quantité suffisante' })
  available: boolean;

  @ApiProperty({ type: [MissingComponentEntity], description: 'Composants indisponibles ou en stock insuffisant' })
  missingComponents: MissingComponentEntity[];

  @ApiProperty({ type: [MenuLineViewEntity] })
  lines: MenuLineViewEntity[];
}

// Vue de gestion (vendeuse propriétaire ou administrateur).
export class ManagedMenuEntity extends PublicMenuEntity {
  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
