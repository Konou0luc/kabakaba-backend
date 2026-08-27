import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, Max, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemComponentDto } from './create-order-item-component.dto';

/**
 * Le client choisit QUOI (menuItemId, quantité, composants) — jamais
 * COMBIEN ça coûte. Le serveur recalcule le prix à partir des valeurs
 * stockées en base (MenuItem.priceTickets, MenuComponent.unitPriceTickets),
 * définies par le vendeur. Aucun champ de prix n'existe dans ce DTO.
 */
export class CreateOrderItemDto {
  @ApiProperty({ example: 'menu-item-uuid' })
  @IsNotEmpty()
  @IsString()
  menuItemId: string;

  @ApiProperty({ example: 1, description: 'Nombre d\'exemplaires de ce menu item commandés' })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(50)
  quantity: number;

  @ApiProperty({ type: [CreateOrderItemComponentDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemComponentDto)
  components?: CreateOrderItemComponentDto[];
}
