import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MenuItemType } from '@prisma/client';

export class MenuItemEntity extends BaseEntity {
  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: 'Plat du Jour' })
  name: string;

  @ApiProperty({ example: 'Plat du jour avec steak et légumes', required: false })
  description?: string;

  @ApiProperty({ enum: MenuItemType })
  type: MenuItemType;

  @ApiProperty({ example: 15 })
  priceTickets: number;

  @ApiProperty({ example: 'https://image.com/plat.jpg', required: false })
  imageUrl?: string;

  @ApiProperty({ example: true })
  isAvailable: boolean;

  @ApiProperty({ example: 15, required: false, description: 'Temps de préparation en minutes' })
  preparationTime?: number;
}
