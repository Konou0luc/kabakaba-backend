import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAbuseDto {
  @ApiProperty({ example: 'student-uuid', description: "Identifiant de l’étudiant" })
  @IsNotEmpty()
  @IsString()
  studentId: string;
}
