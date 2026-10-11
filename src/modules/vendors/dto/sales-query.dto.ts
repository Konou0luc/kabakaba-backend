import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';

export enum SalesGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class SalesQueryDto {
  @ApiPropertyOptional({ description: 'Début de l\'intervalle (date ISO 8601, jour UTC inclus). Défaut : 29 jours avant `to`.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Fin de l\'intervalle (date ISO 8601, jour UTC inclus). Défaut : aujourd\'hui. Durée maximale de l\'intervalle : 366 jours.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: SalesGroupBy, default: SalesGroupBy.DAY, description: 'Regroupement des périodes (semaine : du lundi au dimanche, UTC).' })
  @IsOptional()
  @IsEnum(SalesGroupBy)
  groupBy?: SalesGroupBy;
}
