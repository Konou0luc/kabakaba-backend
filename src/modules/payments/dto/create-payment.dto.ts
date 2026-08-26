import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsEnum, IsInt, Min, IsOptional, IsString } from 'class-validator';
import { PaymentOperator } from '@prisma/client';

export class CreatePaymentDto {
  @ApiProperty({
    example: 'user-uuid',
    required: false,
    description:
      "ID de l'étudiant à créditer. Réservé aux admins — ignoré si l'appelant n'est pas admin (le paiement est alors créé pour l'appelant lui-même).",
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ enum: PaymentOperator })
  @IsNotEmpty()
  @IsEnum(PaymentOperator)
  operator: PaymentOperator;

  @ApiProperty({ example: 1000.00, description: 'Montant en FCFA' })
  @IsNotEmpty()
  amountFcfa: number;

  @ApiProperty({ example: 15, description: 'Tickets reçus' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  ticketsReceived: number;

  @ApiProperty({ example: 'FedaPay-12345', required: false, description: 'Référence FedaPay' })
  @IsOptional()
  @IsString()
  fedapayReference?: string;

  @ApiProperty({ example: 'External-67890', required: false, description: 'Référence externe' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
