import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class StockAnalyticsQueryDto {
  @ApiProperty({ required: false, description: 'Premier jour (ISO 8601, jour UTC). Défaut : 29 jours avant to.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: "Dernier jour inclus (ISO 8601, jour UTC). Défaut : aujourd'hui." })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiProperty({ required: false, default: 10, description: 'Taille des classements (maximum 50)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;
}
