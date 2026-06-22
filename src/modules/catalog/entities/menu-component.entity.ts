import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class MenuComponentEntity extends BaseEntity {
  @ApiProperty({ example: 'menu-item-uuid' })
  itemId: string;

  @ApiProperty({ example: 'Frites' })
  name: string;

  @ApiProperty({ example: 0, description: 'Coût supplémentaire en tickets' })
  unitPriceTickets: number;

  @ApiProperty({ example: 0, description: 'Quantité minimale' })
  minQty: number;

  @ApiProperty({ example: 1, description: 'Quantité maximale' })
  maxQty: number;
}
