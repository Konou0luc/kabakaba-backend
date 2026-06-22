import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '../../../common/entities/base.entity';
import { TransactionType } from '@prisma/client';

export class TransactionEntity extends BaseEntity {
  @ApiProperty({ example: 'user-uuid' })
  userId: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ example: 1000.00, description: 'Montant de la transaction' })
  amount: number;

  @ApiProperty({ example: 'TRX-20260618-00001', description: 'Référence unique de la transaction' })
  reference: string;

  @ApiProperty({ example: 'Recharge via Flooz', required: false, description: 'Description de la transaction' })
  description?: string;

  @ApiProperty({ example: 'order-uuid', required: false, description: 'Identifiant de la commande associée' })
  relatedOrderId?: string;

  @ApiProperty({ example: 'payment-uuid', required: false, description: 'Identifiant du paiement associé' })
  relatedPaymentId?: string;
}
