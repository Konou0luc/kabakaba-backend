import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OrderStatus } from '@prisma/client';

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

  @ApiProperty({ example: 'packaging-option-uuid', required: false })
  packagingOptionId?: string;

  @ApiProperty({ example: 'Raison de refus', required: false })
  reason?: string;

  @ApiProperty({ required: false })
  readyAt?: Date;

  @ApiProperty({ required: false })
  confirmedAt?: Date;
}
