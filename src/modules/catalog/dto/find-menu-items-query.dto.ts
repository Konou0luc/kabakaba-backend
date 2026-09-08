import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindMenuItemsQueryDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'Filtrer par vendeur' })
  @IsOptional()
  @IsString()
  vendorId?: string;
}
