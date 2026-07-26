import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class SetPayoutPercentageDto {
  @ApiProperty({ example: 5, description: 'Pourcentage des revenus nets versé à ce compte (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage: number;
}