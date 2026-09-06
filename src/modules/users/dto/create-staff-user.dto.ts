import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';
import { CreateUserDto } from './create-user.dto';

/**
 * Utilisé uniquement par l'endpoint gardé POST /users/staff
 * (SUPER_ADMIN mobile seulement) — c'est le seul endroit où `role`
 * peut être choisi par l'appelant.
 */
export class CreateStaffUserDto extends CreateUserDto {
  @ApiProperty({ enum: UserRole, description: 'Rôle du compte créé' })
  @IsEnum(UserRole)
  role: UserRole;
}