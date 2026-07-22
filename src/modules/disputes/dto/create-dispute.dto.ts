import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateDisputeDto {
  @ApiProperty({ example: 'order-uuid', description: 'Commande contestée' })
  @IsNotEmpty()
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'Commande jamais reçue mais marquée livrée', minLength: 10 })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  reason: string;

  @ApiProperty({ example: 15, required: false, description: 'Montant en tickets concerné par le litige' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  ticketAmount?: number;
}
