import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

/**
 * `totalTickets` et `escrowAmount` n'existent plus dans ce DTO : ce sont
 * des montants calculés par le serveur (voir OrdersService.create), jamais
 * fournis par le client. Le client décrit uniquement CE QU'IL COMMANDE
 * (items, composants, packaging) ; le prix est déterminé à partir des
 * valeurs fixées par le vendeur en base (MenuItem.priceTickets,
 * MenuComponent.unitPriceTickets, PackagingOption.extraCost).
 */
export class CreateOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ example: 'packaging-option-uuid', required: false })
  @IsOptional()
  @IsString()
  packagingOptionId?: string;
}
