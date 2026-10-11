import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class CreateMenuComponentDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsNotEmpty()
  @IsString()
  itemId: string;

  @ApiProperty({ example: 'Frites' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 0, description: 'Coût supplémentaire en tickets' })
  @IsInt()
  @Min(0)
  unitPriceTickets: number = 0;

  @ApiProperty({ example: 0, description: 'Quantité minimale' })
  @IsInt()
  @Min(0)
  minQty: number = 0;

  @ApiProperty({ example: 1, description: 'Quantité maximale' })
  @IsInt()
  @Min(0)
  maxQty: number = 1;
}
