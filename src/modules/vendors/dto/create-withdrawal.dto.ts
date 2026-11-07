import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsPositive, Min } from 'class-validator';

export enum WithdrawalOperatorDto {
  FLOOZ = 'FLOOZ',
  MIXX = 'MIXX',
}

export class CreateWithdrawalDto {
  @ApiProperty({
    example: 15000,
    description:
      'Montant demandé en FCFA, minimum 500. Aucun frais en dessous de 19 900. À partir de 19 900, Kabakaba ajoute les frais de retrait espèces du réseau au montant envoyé.',
  })
  @IsNumber()
  @IsPositive()
  @Min(500, { message: 'Le retrait minimum est de 500 FCFA' })
  amount: number;

  @ApiProperty({
    enum: WithdrawalOperatorDto,
    example: 'MIXX',
    description: 'Réseau sur lequel l’administrateur effectuera manuellement le transfert : FLOOZ (Moov) ou MIXX (Yas).',
  })
  @IsEnum(WithdrawalOperatorDto)
  operator: WithdrawalOperatorDto;
}
