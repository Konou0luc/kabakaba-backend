import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class MenuLineDto {
  @ApiProperty({ example: 'component-uuid', description: 'Composant non supprimé de la même cantine' })
  @IsNotEmpty()
  @IsString()
  componentId: string;

  @ApiProperty({ example: 1, default: 1, required: false, description: 'Quantité du composant dans le menu (entier de 1 à 100)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;
}
