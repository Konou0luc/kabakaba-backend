import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsEnum, IsString, IsOptional } from 'class-validator';
import { TransactionType, TransactionStatus } from '@prisma/client';

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType })
  @IsNotEmpty()
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus, required: false, default: TransactionStatus.COMPLETED, description: 'État d\'exécution (COMPLETED par défaut : la plupart des transactions internes sont instantanées)' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ example: 1000.00, description: 'Montant de la transaction' })
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'TRX-20260618-00001', description: 'Référence unique de la transaction' })
  @IsNotEmpty()
  @IsString()
  reference: string;

  @ApiProperty({ example: 'Recharge via Flooz', required: false, description: 'Description de la transaction' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'user-uuid-sender', required: false, description: 'Identifiant de l\'utilisateur expéditeur (pour les transferts)' })
  @IsOptional()
  @IsString()
  senderId?: string;

  @ApiProperty({ example: 'user-uuid-receiver', required: false, description: 'Identifiant de l\'utilisateur destinataire (pour les transferts)' })
  @IsOptional()
  @IsString()
  receiverId?: string;

  @ApiProperty({ example: 'order-uuid', required: false, description: 'Identifiant de la commande associée' })
  @IsOptional()
  @IsString()
  relatedOrderId?: string;

  @ApiProperty({ example: 'payment-uuid', required: false, description: 'Identifiant du paiement associé' })
  @IsOptional()
  @IsString()
  relatedPaymentId?: string;
}
