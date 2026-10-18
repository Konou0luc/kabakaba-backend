import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, Min, Max, ValidateIf } from 'class-validator';
import { PaymentOperator } from '@prisma/client';
import {
  MIN_RECHARGE_TICKETS,
  MAX_RECHARGE_TICKETS,
  MIN_RECHARGE_AMOUNT_FCFA,
  MAX_RECHARGE_AMOUNT_FCFA,
} from '../pricing/recharge-pricing';

/**
 * L’étudiant fournit **soit** ticketsReceived (recommandé — tickets souhaités),
 * **soit** amountFcfa (montant payé). Si les deux sont présents, ticketsReceived prime.
 */
export class CreatePaymentIntentDto {
  @ApiPropertyOptional({
    example: 500,
    description:
      'Tickets souhaités sur le portefeuille. Le montant à payer (tickets + frais) ' +
      'est calculé serveur. Ex. 500 tickets → 600 FCFA (frais 100).',
  })
  @ValidateIf((o) => o.amountFcfa === undefined || o.amountFcfa === null)
  @IsNotEmpty({ message: 'Indiquez ticketsReceived ou amountFcfa' })
  @IsInt()
  @Min(MIN_RECHARGE_TICKETS)
  @Max(MAX_RECHARGE_TICKETS)
  ticketsReceived?: number;

  @ApiPropertyOptional({
    example: 600,
    description:
      'Montant FCFA payé (frais inclus). Alternative à ticketsReceived. ' +
      'Ex. 600 FCFA → 500 tickets (frais 100).',
  })
  @ValidateIf((o) => o.ticketsReceived === undefined || o.ticketsReceived === null)
  @IsNotEmpty({ message: 'Indiquez ticketsReceived ou amountFcfa' })
  @IsInt()
  @Min(MIN_RECHARGE_AMOUNT_FCFA)
  @Max(MAX_RECHARGE_AMOUNT_FCFA)
  amountFcfa?: number;

  @ApiProperty({
    enum: PaymentOperator,
    example: PaymentOperator.FLOOZ,
    description: 'Opérateur Mobile Money (FLOOZ | MIXX)',
  })
  @IsNotEmpty()
  @IsEnum(PaymentOperator)
  operator: PaymentOperator;
}

/**
 * Preview : ticketsDesired (recommandé) ou amountFcfa.
 */
export class PreviewRechargeDto {
  @ApiPropertyOptional({
    example: 500,
    description:
      'Tickets souhaités. Ex. 500 → tu paies 600 FCFA (frais 100).',
  })
  @ValidateIf((o) => o.amountFcfa === undefined || o.amountFcfa === null)
  @IsNotEmpty({ message: 'Indiquez ticketsDesired ou amountFcfa' })
  @IsInt()
  @Min(MIN_RECHARGE_TICKETS)
  @Max(MAX_RECHARGE_TICKETS)
  ticketsDesired?: number;

  @ApiPropertyOptional({
    example: 600,
    description: 'Montant FCFA payé (frais inclus). Alternative à ticketsDesired.',
  })
  @ValidateIf((o) => o.ticketsDesired === undefined || o.ticketsDesired === null)
  @IsNotEmpty({ message: 'Indiquez ticketsDesired ou amountFcfa' })
  @IsInt()
  @Min(MIN_RECHARGE_AMOUNT_FCFA)
  @Max(MAX_RECHARGE_AMOUNT_FCFA)
  amountFcfa?: number;
}
