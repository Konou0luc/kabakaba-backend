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
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isSuspended?: boolean;
}
