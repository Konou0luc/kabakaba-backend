import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotIn, Max, Min } from 'class-validator';
import { COMPONENT_MAX_VALUE } from './create-component.dto';

export class AdjustStockDto {
  @ApiProperty({
    example: 20,
    description: 'Ajustement du stock, entier non nul. Positif : ajout (+20). Négatif : correction.',
  })
  @IsInt()
  @IsNotIn([0])
  @Min(-COMPONENT_MAX_VALUE)
  @Max(COMPONENT_MAX_VALUE)
  delta: number;
}
