import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsPhoneNumber, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ example: '+22890000000', required: false, description: 'Numéro de téléphone' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiProperty({ example: 'student@univ.tg', required: false, description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'password123', minLength: 6, required: false, description: 'Mot de passe (minimum 6 caractères)' })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'Jean', description: 'Prénom' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Dupont', description: 'Nom de famille' })
  @IsString()
  lastName: string;

  @ApiProperty({ enum: UserRole, default: UserRole.STUDENT, description: 'Rôle de l\'utilisateur' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ example: 'uuid-campus', required: false, description: 'Identifiant du campus' })
  @IsOptional()
  @IsString()
  campusId?: string;
}
