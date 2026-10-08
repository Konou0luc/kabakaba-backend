import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ComponentUnit } from '@prisma/client';

// Borne haute commune : évite un dépassement de l'entier 32 bits en base.
export const COMPONENT_MAX_VALUE = 1_000_000;

export class CreateComponentDto {
  @ApiProperty({
    example: 'vendor-uuid',
    required: false,
    description: 'Ignoré pour une vendeuse (sa propre cantine est utilisée) ; obligatoire pour un administrateur',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ example: 'category-uuid', required: false, description: 'Catégorie de la même vendeuse' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Riz', description: 'Nom du composant (60 caractères maximum)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ enum: ComponentUnit, example: ComponentUnit.PORTION })
  @IsEnum(ComponentUnit)
  unit: ComponentUnit;

  @ApiProperty({ example: 20, default: 0, required: false, description: 'Quantité initiale (entier ≥ 0)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(COMPONENT_MAX_VALUE)
  quantity?: number;

  @ApiProperty({ example: 2, default: 0, required: false, description: 'Prix unitaire en tickets (entier ≥ 0)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(COMPONENT_MAX_VALUE)
  priceTickets?: number;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ example: 5, required: false, description: "Seuil d'alerte de stock faible (entier ≥ 0)" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(COMPONENT_MAX_VALUE)
  lowStockThreshold?: number;
}
