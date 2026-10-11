import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportStatus } from '@prisma/client';

export class UpdateReportDto {
  @ApiProperty({ enum: ReportStatus, required: false })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiProperty({ required: false, description: 'Identifiant du WebUser ayant traité le signalement' })
  @IsOptional()
  @IsString()
  treatedByWebUserId?: string;
}
