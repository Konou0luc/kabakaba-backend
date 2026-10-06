import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderStatus, ConsumptionMode } from '@prisma/client';

export class OrderEntity extends BaseEntity {
  @ApiProperty({ example: 'student-uuid' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ example: 15 })
  totalTickets: number;

  @ApiProperty({ example: 150.00 })
  escrowAmount: number;

  @ApiProperty({ enum: ConsumptionMode })
  consumptionMode: ConsumptionMode;

  @ApiProperty({ required: false, description: "Option d'emporté choisie (si TAKEAWAY)" })
  takeawayOptionId?: string;

  @ApiProperty({ example: 1, description: "Prix de l'option d'emporté figé à la commande, en tickets (0 sur place)" })
  takeawayFeeTickets: number;

  @ApiProperty({ example: 'Raison de refus', required: false })
  reason?: string;

  @ApiProperty({ required: false })
  readyAt?: Date;

  @ApiProperty({ required: false })
  confirmedAt?: Date;
}
