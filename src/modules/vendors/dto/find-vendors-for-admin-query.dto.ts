import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FindVendorsForAdminQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Recherche sur le nom de la cantine ou le nom du vendeur' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filtrer sur un campus précis' })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiPropertyOptional({ enum: ['active', 'suspended'] })
  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';

  @ApiPropertyOptional({ description: 'Ne garder que les cantines avec une créance active' })
  @IsOptional()
  @IsBooleanString()
  hasDebt?: string;
}
