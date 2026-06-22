import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { AmbassadorLevel } from '@prisma/client';

export class CreateAmbassadorDto {
  @ApiProperty({ example: 'user-uuid', description: 'Identifiant de l\'utilisateur' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ enum: AmbassadorLevel, required: false, description: 'Niveau de l\'ambassadeur (BRONZE, SILVER, GOLD)' })
  @IsOptional()
  @IsEnum(AmbassadorLevel)
  level?: AmbassadorLevel;
}
