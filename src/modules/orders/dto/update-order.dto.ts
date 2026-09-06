import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * Une commande est financièrement immuable après sa création.
 * Le PATCH ne permet donc de modifier que son statut et, éventuellement,
 * son motif opérationnel. Les montants, le vendeur, les articles et
 * l'emballage sont définitivement ceux calculés lors de la création.
 */
export class UpdateOrderDto {
  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ required: false, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
