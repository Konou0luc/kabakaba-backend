import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class FindUsersQueryDto extends PaginationDto {
  @ApiProperty({ enum: UserRole, required: false, description: 'Filtrer par rôle' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiProperty({ required: false, description: 'Filtrer par identifiant de campus' })
  @IsOptional()
  @IsString()
  campusId?: string;

  @ApiProperty({ required: false, description: 'Filtrer par statut de suspension' })
  @IsOptional()
  // Un paramètre d'URL est une chaîne : « false » devient true avec enableImplicitConversion (main.ts).
  // On lit donc la valeur d'origine ; toute autre chaîne reste telle quelle et @IsBoolean la refuse (400).
  @Transform(({ obj, key }) => (obj[key] === 'true' ? true : obj[key] === 'false' ? false : obj[key]))
  @IsBoolean()
  isSuspended?: boolean;
}
