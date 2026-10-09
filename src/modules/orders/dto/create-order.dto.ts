import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { ConsumptionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto';

/**
 * `totalTickets` n'existe pas dans ce DTO : c'est un montant calculé par
 * le serveur (voir OrdersService.create), jamais
 * fourni par le client. Le client décrit uniquement CE QU'IL COMMANDE
 * (menus pré-composés et composants libres) ; le prix est déterminé à partir
 * des prix des composants fixés par la vendeuse en base (Component.priceTickets).
 */
export class CreateOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ enum: ConsumptionMode, example: ConsumptionMode.ON_SITE, description: 'Sur place ou à emporter (obligatoire)' })
  @IsEnum(ConsumptionMode)
  consumptionMode: ConsumptionMode;

  @ApiProperty({
    example: 'takeaway-option-uuid',
    required: false,
    description: "Option d'emporté de la cantine : obligatoire si TAKEAWAY, interdite si ON_SITE",
  })
  @IsOptional()
  @IsString()
  takeawayOptionId?: string;
}
