import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional, IsInt, IsBoolean, Min } from 'class-validator';
import { MenuItemType } from '@prisma/client';

export class CreateMenuItemDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({ example: 'Plat du Jour' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Plat du jour avec steak et légumes', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: MenuItemType, default: MenuItemType.FIXED })
  @IsEnum(MenuItemType)
  type: MenuItemType;

  @ApiProperty({ example: 15 })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  priceTickets: number;

  @ApiProperty({ example: 'https://image.com/plat.jpg', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({ example: true, default: true, required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ example: 15, required: false, description: 'Temps de préparation en minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTime?: number;
}
