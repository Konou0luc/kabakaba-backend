import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateComponentCategoryDto {
  @ApiProperty({
    example: 'vendor-uuid',
    required: false,
    description: 'Ignoré pour une vendeuse (sa propre cantine est utilisée) ; obligatoire pour un administrateur',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ example: 'Protéine', description: 'Nom de la catégorie (60 caractères maximum)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name: string;
}
