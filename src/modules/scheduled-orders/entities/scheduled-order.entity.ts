import { ApiProperty } from '@nestjs/swagger';
import { ConsumptionMode, ScheduledOrderStatus } from '@prisma/client';
import { BaseEntity } from '../../../common/entities/base.entity';

export class ScheduledOrderEntity extends BaseEntity {
  @ApiProperty({ example: 'student-uuid' })
  studentId: string;

  @ApiProperty({ example: 'vendor-uuid' })
  vendorId: string;

  @ApiProperty({ example: '2026-10-11T12:30:00.000Z', description: 'Heure prévue de la commande' })
  scheduledFor: Date;

  @ApiProperty({ enum: ConsumptionMode })
  consumptionMode: ConsumptionMode;

  @ApiProperty({ required: false, nullable: true })
  takeawayOptionId?: string | null;

  @ApiProperty({
    example: [{ menuId: 'menu-uuid', quantity: 1 }, { componentId: 'component-uuid', quantity: 2 }],
    description: 'Lignes demandées : { menuId ou componentId, quantity }',
  })
  items: unknown;

  @ApiProperty({
    enum: ScheduledOrderStatus,
    description:
      'PENDING : en attente de l\'heure prévue ; PLACED : commande créée (voir orderId) ; FAILED : échec à l\'heure prévue (voir failureReason) ; CANCELLED : annulée par l\'étudiant',
  })
  status: ScheduledOrderStatus;

  @ApiProperty({ required: false, nullable: true, description: 'Commande créée, une fois PLACED' })
  orderId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Motif de l\'échec, si FAILED' })
  failureReason?: string | null;

  @ApiProperty({ required: false, nullable: true })
  processedAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  cancelledAt?: Date | null;
}
