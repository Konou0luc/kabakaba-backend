import { ApiProperty } from '@nestjs/swagger';
import { ComponentUnit } from '@prisma/client';
import { BaseEntity } from '../../../common/entities/base.entity';

// Vue de gestion (vendeuse propriétaire ou administrateur).
export class ComponentEntity extends BaseEntity {
  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ required: false, nullable: true })
  categoryId: string | null;

  @ApiProperty({ example: 'Riz' })
  name: string;

  @ApiProperty({ enum: ComponentUnit })
  unit: ComponentUnit;

  @ApiProperty({ example: 20 })
  quantity: number;

  @ApiProperty({ example: 2, description: 'Prix unitaire en tickets' })
  priceTickets: number;

  @ApiProperty({ example: true })
  isAvailable: boolean;

  @ApiProperty({ required: false, nullable: true, example: 5 })
  lowStockThreshold: number | null;
}

// Vue publique (étudiants) : jamais la quantité ni le seuil.
export class PublicComponentEntity {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Riz' })
  name: string;

  @ApiProperty({ required: false, nullable: true })
  categoryId: string | null;

  @ApiProperty({ enum: ComponentUnit })
  unit: ComponentUnit;

  @ApiProperty({ example: 2 })
  priceTickets: number;

  @ApiProperty({ example: true, description: 'Vrai si le composant est disponible et que son stock est supérieur à 0' })
  available: boolean;
}

export class StockAdjustmentEntity {
  @ApiProperty({ example: 'component-uuid' })
  id: string;

  @ApiProperty({ example: 25, description: 'Nouvelle quantité après ajustement' })
  quantity: number;
}
