import { ApiProperty } from '@nestjs/swagger';
import { DisputeStatus, DisputeDecision } from '@prisma/client';

export class DisputeEntity {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'order-uuid' })
  orderId: string;

  @ApiProperty({ example: 'student-uuid' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: 'Commande jamais reçue mais marquée livrée' })
  reason: string;

  @ApiProperty({ example: 15, required: false, description: 'Montant en tickets concerné par le litige' })
  ticketAmount?: number;

  @ApiProperty({ enum: DisputeStatus, default: DisputeStatus.OPEN })
  status: DisputeStatus;

  @ApiProperty({ enum: DisputeDecision, required: false })
  decision?: DisputeDecision;

  @ApiProperty({ required: false, description: 'Note de résolution rédigée par l\'équipe support' })
  decisionNote?: string;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité le litige' })
  treatedByWebUserId?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true })
  resolvedAt?: Date;
}
