import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemComponentInputDto } from './order-item-component-input.dto';

export class OrderItemInputDto {
  @ApiProperty({ example: 'menu-item-uuid', description: 'Identifiant du MenuItem commandé' })
  @IsNotEmpty()
  @IsString()
  itemId: string;

  @ApiProperty({ example: 1, description: 'Quantité de cet item' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @ApiProperty({
    type: [OrderItemComponentInputDto],
    required: false,
    description: 'Composants choisis (uniquement pour un item de type CUSTOMIZABLE)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemComponentInputDto)
  components?: OrderItemComponentInputDto[];
}
