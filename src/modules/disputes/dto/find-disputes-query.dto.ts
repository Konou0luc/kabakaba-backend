import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsInt, Min } from 'class-validator';
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

  @ApiProperty({ required: false, description: 'Ne garder que les litiges signalés dans les N derniers jours (ex: 7, 30)' })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsInt()
  @Min(1)
  days?: number;
}
