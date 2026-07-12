import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPositive, IsString, IsEnum } from 'class-validator';
import { PaymentOperator } from '@prisma/client';

export class CreatePaymentIntentDto {
  @ApiProperty({
    example: 5000,
    description: 'Montant en FCFA à recharger',
  })
  @IsNotEmpty()
  @IsPositive()
  amount: number;

  @ApiProperty({
    example: 50,
    description: 'Nombre de tickets à recevoir',
  })
  @IsNotEmpty()
  @IsPositive()
  ticketsReceived: number;

  @ApiProperty({
    enum: PaymentOperator,
    example: PaymentOperator.FLOOZ,
    description: 'Opérateur de paiement Mobile Money',
  })
  @IsNotEmpty()
  @IsEnum(PaymentOperator)
  operator: PaymentOperator;
}
