import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { PaymentOperator } from '@prisma/client';

/** DTO strictement réservé aux ajustements manuels du back-office Web. */
export class CreateManualPaymentDto {
  @ApiProperty({ example: 'user-uuid', description: "Étudiant à créditer." })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: PaymentOperator })
  @IsNotEmpty()
  @IsEnum(PaymentOperator)
  operator: PaymentOperator;

  @ApiProperty({ example: 2200, description: 'Montant réellement payé en FCFA, frais inclus.' })
  @IsNotEmpty()
  amountFcfa: number;

  @ApiProperty({ example: 2000, description: 'Tickets à créditer; cohérence vérifiée côté serveur.' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  ticketsReceived: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fedapayReference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
