import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, Min, Max, ValidateIf } from 'class-validator';
import { PaymentOperator } from '@prisma/client';
import {
  MIN_RECHARGE_TICKETS,
  MAX_RECHARGE_TICKETS,
  MIN_RECHARGE_AMOUNT_FCFA,
  MAX_RECHARGE_AMOUNT_FCFA,
} from '../pricing/recharge-pricing';

/**
 * L’étudiant fournit **soit** amountFcfa (recommandé — UX mobile),
 * **soit** ticketsReceived (rétrocompat). Pas les deux en conflit :
 * si amountFcfa est présent, il prime.
 */
export class CreatePaymentIntentDto {
  @ApiPropertyOptional({
    example: 2200,
    description:
      'Montant en FCFA que l’étudiant va payer (frais inclus). ' +
      'Les tickets crédités sont calculés serveur selon le barème. ' +
      'Exemple : 2200 FCFA → 2000 tickets (frais 200 inclus).',
  })
  @ValidateIf((o) => o.ticketsReceived === undefined || o.ticketsReceived === null)
  @IsNotEmpty({ message: 'Indiquez amountFcfa ou ticketsReceived' })
  @IsInt()
  @Min(MIN_RECHARGE_AMOUNT_FCFA)
  @Max(MAX_RECHARGE_AMOUNT_FCFA)
  amountFcfa?: number;

  @ApiPropertyOptional({
    example: 2000,
    description:
      'Ancien mode : nombre de tickets souhaités. Le montant à payer est alors calculé serveur. ' +
      'Préférer amountFcfa côté mobile.',
  })
  @ValidateIf((o) => o.amountFcfa === undefined || o.amountFcfa === null)
  @IsNotEmpty({ message: 'Indiquez amountFcfa ou ticketsReceived' })
  @IsInt()
  @Min(MIN_RECHARGE_TICKETS)
  @Max(MAX_RECHARGE_TICKETS)
  ticketsReceived?: number;

  @ApiProperty({
    enum: PaymentOperator,
    example: PaymentOperator.FLOOZ,
    description: 'Opérateur Mobile Money (FLOOZ | MIXX)',
  })
  @IsNotEmpty()
  @IsEnum(PaymentOperator)
  operator: PaymentOperator;
}

export class PreviewRechargeDto {
  @ApiProperty({
    example: 2200,
    description: 'Montant FCFA saisi par l’étudiant (frais inclus dans ce montant).',
  })
  @IsNotEmpty()
  @IsInt()
  @Min(MIN_RECHARGE_AMOUNT_FCFA)
  @Max(MAX_RECHARGE_AMOUNT_FCFA)
  amountFcfa: number;
}
