import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({
    example: 15000,
    description:
      'Montant à retirer en FCFA (hors frais). Les frais à la charge du vendeur sont calculés serveur selon les seuils CDC 5.3.',
  })
  @IsNumber()
  @IsPositive()
  @Min(1)
  amount: number;
}
