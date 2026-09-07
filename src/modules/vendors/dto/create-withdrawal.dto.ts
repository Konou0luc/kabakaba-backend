import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive, Min } from 'class-validator';

export enum WithdrawalOperatorDto {
  FLOOZ = 'FLOOZ',
  MIXX = 'MIXX',
}

export class CreateWithdrawalDto {
  @ApiProperty({
    example: 15000,
    description: 'Montant demandé en FCFA (ce que le vendeur veut recevoir sur son mobile money).',
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;

  @ApiProperty({
    enum: WithdrawalOperatorDto,
    example: 'MIXX',
    description: 'Réseau sur lequel l’administrateur effectuera manuellement le transfert : FLOOZ (Moov) ou MIXX (Yas).',
  })
  @IsEnum(WithdrawalOperatorDto)
  operator: WithdrawalOperatorDto;
}
