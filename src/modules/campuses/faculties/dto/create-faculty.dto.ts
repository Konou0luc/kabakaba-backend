import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFacultyDto {
  @ApiProperty({ example: 'Faculté de Droit' })
  @IsNotEmpty()
  @IsString()
  name: string;
}
