import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindOrdersQueryDto extends PaginationDto {
  @ApiProperty({ enum: OrderStatus, required: false, description: 'Filtrer par statut de commande' })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({
    required: false,
    description: 'Filtrer par plusieurs statuts à la fois, séparés par des virgules (ex: PENDING,ACCEPTED,IN_PREPARATION,READY)',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value))
  @IsEnum(OrderStatus, { each: true })
  statuses?: OrderStatus[];

  @ApiProperty({ required: false, description: 'Filtrer par identifiant vendeur (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: "Filtrer par campus de l'étudiant qui a passé la commande (admin/super admin seulement)" })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ required: false, description: 'Date de début (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: 'Date de fin (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
