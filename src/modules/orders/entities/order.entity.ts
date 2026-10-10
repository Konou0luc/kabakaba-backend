import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderStatus, ConsumptionMode, OrderCancelledBy } from '@prisma/client';

export class OrderEntity extends BaseEntity {
  @ApiProperty({ example: 'student-uuid' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: 'A-05', description: 'Numéro de commande propre à la cantine (A-00 à Z-10), conservé à vie' })
  orderNumber: string;

  @ApiProperty({
    required: false,
    nullable: true,
    example: 'A-05',
    description: "Champ interne : vaut orderNumber tant que la commande est active, null dès qu'elle est RECEIVED ou CANCELLED",
  })
  activeOrderNumber?: string | null;

  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;

  @ApiProperty({ example: 15 })
  totalTickets: number;

  @ApiProperty({ enum: ConsumptionMode })
  consumptionMode: ConsumptionMode;

  @ApiProperty({ required: false, description: "Option d'emporté choisie (si TAKEAWAY)" })
  takeawayOptionId?: string;

  @ApiProperty({ example: 1, description: "Prix de l'option d'emporté figé à la commande, en tickets (0 sur place)" })
  takeawayFeeTickets: number;

  @ApiProperty({ required: false })
  readyAt?: Date;

  @ApiProperty({ required: false })
  receivedAt?: Date;

  @ApiProperty({ required: false })
  cancelledAt?: Date;

  @ApiProperty({ enum: OrderCancelledBy, required: false })
  cancelledBy?: OrderCancelledBy;

  @ApiProperty({ required: false, description: "Utilisateur auteur de l'annulation (étudiant ou vendeuse)" })
  cancelledById?: string;

  @ApiProperty({ required: false, description: "Motif d'annulation (obligatoire à l'annulation)" })
  cancellationReason?: string;

  @ApiProperty({ example: 15, description: 'Tickets remboursés à l\'annulation (0 si la commande n\'est pas annulée)' })
  refundedTickets: number;
}
