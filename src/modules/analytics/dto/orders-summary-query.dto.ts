import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class OrdersSummaryQueryDto {
  @ApiProperty({ required: false, description: 'Premier jour (ISO 8601, jour UTC). Défaut : 29 jours avant to.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: "Dernier jour inclus (ISO 8601, jour UTC). Défaut : aujourd'hui." })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
