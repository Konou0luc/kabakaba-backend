import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ScheduledOrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindScheduledOrdersQueryDto extends PaginationDto {
  @ApiProperty({ enum: ScheduledOrderStatus, required: false, description: 'Filtrer par statut' })
  @IsOptional()
  @IsEnum(ScheduledOrderStatus)
  status?: ScheduledOrderStatus;
}
