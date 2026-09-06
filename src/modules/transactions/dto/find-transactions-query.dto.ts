import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
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

  @ApiProperty({ required: false, description: 'Filtrer par cantine (commandes/séquestres/remboursements liés à cette cantine, ou retraits de cette cantine)' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ required: false, description: "Filtrer par campus de l'utilisateur propriétaire de la transaction (approximatif pour les transactions vendeur : le compte vendeur n'a pas toujours un campus personnel renseigné)" })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ required: false, description: 'Date de début (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiProperty({ required: false, description: 'Date de fin (ISO 8601), pour une plage personnalisée' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
