import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class AnalyticsQueryDto {
  @ApiProperty({ required: false, default: 30, description: "Fenêtre en jours" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  @Transform(({ value }) => parseInt(value))
  days?: number = 30;

  @ApiProperty({ required: false, default: 10, description: "Nombre d'éléments (classements)" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Transform(({ value }) => parseInt(value))
  limit?: number = 10;
}