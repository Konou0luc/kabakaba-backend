import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class PackagingOptionEntity extends BaseEntity {
  @ApiProperty({ example: 'menu-item-uuid' })
  itemId: string;

  @ApiProperty({ example: 'Sur Place' })
  name: string;

  @ApiProperty({ example: 0, description: 'Coût supplémentaire en tickets' })
  extraCost: number;

  @ApiProperty({ example: false, description: 'Si cette option est obligatoire' })
  required: boolean;
}
