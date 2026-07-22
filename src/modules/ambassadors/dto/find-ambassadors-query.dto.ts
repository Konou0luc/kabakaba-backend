import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindAmbassadorsQueryDto extends PaginationDto {
  @ApiProperty({ enum: AmbassadorStatus, required: false, description: 'Filtrer par statut (ex: PENDING pour les candidatures en attente)' })
  @IsOptional()
  @IsEnum(AmbassadorStatus)
  status?: AmbassadorStatus;

  @ApiProperty({ enum: AmbassadorLevel, required: false })
  @IsOptional()
  @IsEnum(AmbassadorLevel)
  level?: AmbassadorLevel;
}
