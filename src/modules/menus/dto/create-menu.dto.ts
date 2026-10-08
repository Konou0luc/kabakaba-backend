import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MenuLineDto } from './menu-line.dto';

export class CreateMenuDto {
  @ApiProperty({
    example: 'vendor-uuid',
    required: false,
    description: 'Ignoré pour une vendeuse (sa propre cantine est utilisée) ; obligatoire pour un administrateur',
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ example: 'Menu Poulet spécial', description: 'Nom du menu (60 caractères maximum)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'Riz, poulet, haricots et sauce', required: false, description: '500 caractères maximum' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [MenuLineDto], description: 'Au moins une ligne ; un composant ne peut apparaître qu\'une fois' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MenuLineDto)
  lines: MenuLineDto[];
}
