import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class SendMoneyDto {
  @ApiProperty({ example: '+22890123456', description: 'Numéro de téléphone du destinataire' })
  @IsNotEmpty()
  @IsString()
  recipientPhone: string;

  @ApiProperty({ example: 500, description: 'Montant à envoyer' })
  @IsNotEmpty()
  @IsPositive()
  amount: number;
}
