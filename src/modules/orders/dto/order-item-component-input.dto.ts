import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max } from 'class-validator';

export class OrderItemComponentInputDto {
  @ApiProperty({ example: 'component-uuid', description: 'Identifiant du MenuComponent choisi' })
  @IsNotEmpty()
  @IsString()
  componentId: string;

  @ApiProperty({ example: 1, description: 'Quantité de ce composant' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;
}
