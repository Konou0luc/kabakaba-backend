import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class CreateOrderItemComponentDto {
  @ApiProperty({ example: 'component-uuid' })
  @IsNotEmpty()
  @IsString()
  componentId: string;

  @ApiProperty({ example: 1, description: 'Quantité de ce composant choisie par l\'étudiant' })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  quantity: number;
}
