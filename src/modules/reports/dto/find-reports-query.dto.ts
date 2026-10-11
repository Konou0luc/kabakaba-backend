import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ReportStatus, ReportType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindReportsQueryDto extends PaginationDto {
  @ApiProperty({ enum: ReportStatus, required: false, description: 'Filtrer par statut de traitement' })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiProperty({ enum: ReportType, required: false, description: 'Filtrer par type de problème' })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @ApiProperty({ required: false, description: 'Filtrer par cantine (administration web seulement)' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par étudiant (administration web seulement)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par commande' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiProperty({ required: false, description: "Filtrer par campus de l'étudiant (administration web seulement)" })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ required: false, description: 'Ne garder que les signalements des N derniers jours (ex: 7, 30) — ignoré si from/to fournis' })
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
