import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { DisputeStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindDisputesQueryDto extends PaginationDto {
  @ApiProperty({ enum: DisputeStatus, required: false, description: 'Filtrer par statut de traitement' })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiProperty({ required: false, description: 'Filtrer par vendeur (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par étudiant (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par commande' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ required: false, description: "Filtrer par campus de l'étudiant (admin/super admin seulement)" })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ required: false, description: 'Ne garder que les litiges signalés dans les N derniers jours (ex: 7, 30) — ignoré si from/to fournis' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  days?: number;

  @ApiProperty({ required: false, description: 'Date de début (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: 'Date de fin (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
