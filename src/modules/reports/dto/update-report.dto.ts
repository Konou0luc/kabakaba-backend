import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportStatus } from '@prisma/client';

// Seul le statut se modifie. L'administrateur qui traite le signalement n'est jamais fourni par le
// client : il est lu dans le jeton (voir ReportsController.update).
export class UpdateReportDto {
  @ApiProperty({ enum: ReportStatus, required: false })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
