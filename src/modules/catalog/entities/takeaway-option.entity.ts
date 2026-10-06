import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';

export class TakeawayOptionEntity extends BaseEntity {
  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: 'Take away' })
  name: string;

  @ApiProperty({ example: 1, description: "Prix en tickets, ajouté une seule fois au total de la commande" })
  priceTickets: number;

  @ApiProperty({ example: true })
  isActive: boolean;
}
