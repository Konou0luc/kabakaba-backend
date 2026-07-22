import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindOrdersQueryDto extends PaginationDto {
  @ApiProperty({ enum: OrderStatus, required: false, description: 'Filtrer par statut de commande' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ required: false, description: 'Filtrer par identifiant vendeur (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  vendorId?: string;
}
