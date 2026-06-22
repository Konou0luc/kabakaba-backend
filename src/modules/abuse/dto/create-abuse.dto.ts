import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean, IsInt, IsOptional } from 'class-validator';

export class CreateAbuseDto {
  @ApiProperty({ example: 'student-uuid', description: 'Identifiant de l\'étudiant' })
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @ApiProperty({ example: 3, required: false, description: 'Nombre d\'abus' })
  @IsOptional()
  @IsInt()
  count?: number;

  @ApiProperty({ example: true, required: false, description: 'Si un avertissement a été envoyé' })
  @IsOptional()
  @IsBoolean()
  warningSent?: boolean;
}
