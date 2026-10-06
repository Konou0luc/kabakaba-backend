import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SuspensionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindSuspensionEventsQueryDto extends PaginationDto {
  @ApiProperty({ enum: SuspensionStatus, required: false, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(SuspensionStatus)
  status?: SuspensionStatus;

  @ApiProperty({ required: false, description: 'Filtrer sur un étudiant précis' })
  @IsOptional()
  @IsString()
  studentId?: string;
}