import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

// Volontairement indépendant de CreateOrderDto : une commande ne se modifie
// pas en changeant ses items/son prix après coup (on annule et on recrée).
// Seul le statut peut évoluer après création — voir aussi
// OrdersService.VENDOR_UPDATABLE_FIELDS pour la restriction par rôle.
export class UpdateOrderDto {
  @ApiProperty({ enum: OrderStatus, required: false })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
