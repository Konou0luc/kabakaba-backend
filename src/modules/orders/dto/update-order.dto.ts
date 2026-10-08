import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

/**
 * Une commande est financièrement immuable après sa création. Le PATCH ne
 * permet que de faire avancer son statut, dans l'ordre strict
 * CONFIRMED → IN_PREPARATION → READY → RECEIVED. L'annulation passe par
 * POST /orders/:id/cancel.
 */
export class UpdateOrderDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
