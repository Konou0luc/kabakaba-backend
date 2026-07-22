import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TransactionType, TransactionStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindTransactionsQueryDto extends PaginationDto {
  @ApiProperty({ enum: TransactionType, required: false, description: 'Filtrer par type de transaction' })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiProperty({ enum: TransactionStatus, required: false, description: 'Filtrer par état d\'exécution' })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiProperty({ required: false, description: 'Filtrer par identifiant utilisateur (admin/super admin seulement)' })
  @IsOptional()
  @IsString()
  userId?: string;
}
