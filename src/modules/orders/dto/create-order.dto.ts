import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemInputDto } from './order-item-input.dto';

export class CreateOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({
    type: [OrderItemInputDto],
    description:
      "Items commandés. Le prix total (totalTickets/escrowAmount) est calculé " +
      "par le serveur à partir du catalogue — il n'est jamais fourni par le client.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ApiProperty({ example: 'packaging-option-uuid', required: false })
  @IsOptional()
  @IsString()
  packagingOptionId?: string;
}
