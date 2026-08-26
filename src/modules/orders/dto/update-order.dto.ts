import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import { CreateOrderDto } from './create-order.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

// `items` n'est jamais modifiable après création (c'est une relation, pas
// un scalaire — la commande doit être annulée et recréée pour changer son
// contenu, pas patchée).
export class UpdateOrderDto extends PartialType(OmitType(CreateOrderDto, ['items'] as const)) {
  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
