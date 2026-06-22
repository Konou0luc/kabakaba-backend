import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentOperator, PaymentStatus } from '@prisma/client';

export class PaymentEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ enum: PaymentOperator })
  operator: PaymentOperator;

  @ApiProperty({ example: 1000.00, description: 'Montant en FCFA' })
  amountFcfa: number;

  @ApiProperty({ example: 15, description: 'Tickets reçus' })
  ticketsReceived: number;

  @ApiProperty({ example: 'FedaPay-12345', required: false, description: 'Référence FedaPay' })
  fedapayReference?: string;

  @ApiProperty({ example: 'External-67890', required: false, description: 'Référence externe' })
  externalReference?: string;

  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;
}
