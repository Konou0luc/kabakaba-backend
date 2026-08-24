import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsInt, IsEnum, Min, Max } from 'class-validator';
import { PaymentOperator } from '@prisma/client';
import { MIN_RECHARGE_TICKETS, MAX_RECHARGE_TICKETS } from '../pricing/recharge-pricing';

export class CreatePaymentIntentDto {
  @ApiProperty({
    example: 1000,
    description:
      "Nombre de tickets souhaités. Le montant à payer (FCFA) est calculé " +
      "par le serveur selon le barème officiel — il n'est jamais fourni par le client.",
  })
  @IsNotEmpty()
  @IsInt()
  @Min(MIN_RECHARGE_TICKETS)
  @Max(MAX_RECHARGE_TICKETS)
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
