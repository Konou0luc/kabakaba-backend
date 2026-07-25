import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindReviewsQueryDto extends PaginationDto {
  @ApiProperty({ required: false, description: 'Filtrer par vendeur' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, minimum: 1, maximum: 5, description: 'Filtrer par note exacte (1-5)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  @Transform(({ value }) => parseInt(value))
  rating?: number;

  @ApiProperty({ required: false, description: 'Recherche texte dans le commentaire' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: ['recent', 'oldest', 'highest', 'lowest'], default: 'recent' })
  @IsOptional()
  @IsIn(['recent', 'oldest', 'highest', 'lowest'])
  sortBy?: 'recent' | 'oldest' | 'highest' | 'lowest' = 'recent';
}