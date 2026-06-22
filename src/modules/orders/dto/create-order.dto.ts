import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, IsOptional } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({ example: 15, description: 'Total de tickets' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  totalTickets: number;

  @ApiProperty({ example: 150.00, description: 'Montant du séquestre en FCFA' })
  @IsNotEmpty()
  escrowAmount: number;

  @ApiProperty({ example: 'packaging-option-uuid', required: false })
  @IsOptional()
  @IsString()
  packagingOptionId?: string;
}
