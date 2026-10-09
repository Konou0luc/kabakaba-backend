import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional } from 'class-validator';

/**
 * Le client choisit QUOI (un menu pré-composé OU un composant libre, et la
 * quantité) — jamais COMBIEN ça coûte. Le serveur recalcule le prix à partir
 * des valeurs stockées en base (Component.priceTickets, et la somme des lignes
 * pour un menu). Aucun champ de prix n'existe dans ce DTO.
 * Une ligne désigne exactement l'un des deux : menuId ou componentId.
 */
export class CreateOrderItemDto {
  @ApiProperty({ example: 'menu-uuid', required: false, description: 'Menu pré-composé (exclusif avec componentId)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  menuId?: string;

  @ApiProperty({ example: 'component-uuid', required: false, description: 'Composant libre (exclusif avec menuId)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  componentId?: string;

  @ApiProperty({ example: 1, description: "Nombre d'exemplaires de ce menu ou de ce composant (1 à 50)" })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;
}
