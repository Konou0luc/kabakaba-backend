import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString } from 'class-validator';

export class RequestWithdrawalDto {
  @ApiProperty({ example: 5000, description: 'Montant à retirer (FCFA)' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ example: '+22890000000', description: 'Numéro mobile money destinataire' })
  @IsString()
  payoutNumber: string;
}

export class RejectWithdrawalDto {
  @ApiProperty({ example: 'Montant incohérent avec le solde' })
  @IsString()
  reason: string;
}