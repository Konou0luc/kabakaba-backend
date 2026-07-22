import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DisputeStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindDisputesQueryDto extends PaginationDto {
  @ApiProperty({ enum: DisputeStatus, required: false, description: 'Filtrer par statut de traitement' })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiProperty({ required: false, description: 'Filtrer par vendeur (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par étudiant (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  studentId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par commande' })
  @IsOptional()
  @IsString()
  orderId?: string;
}
