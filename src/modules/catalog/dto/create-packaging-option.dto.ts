import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class CreatePackagingOptionDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsNotEmpty()
  @IsString()
  itemId: string;

  @ApiProperty({ example: 'Sur Place' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 0, description: 'Coût supplémentaire en tickets' })
  @IsInt()
  @Min(0)
  extraCost: number = 0;

  @ApiProperty({ example: false, description: 'Si cette option est obligatoire', default: false, required: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean = false;
}
