import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PartnerApplicationStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindPartnerApplicationsQueryDto extends PaginationDto {
  @ApiProperty({ enum: PartnerApplicationStatus, required: false, description: 'Filtrer par statut de traitement' })
  @IsOptional()
  @IsEnum(PartnerApplicationStatus)
  status?: PartnerApplicationStatus;
}
