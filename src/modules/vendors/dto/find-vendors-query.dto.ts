import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindVendorsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Filtrer les cantines affiliées à ce campus' })
  @IsOptional()
  @IsString()
  campusId?: string;
}
