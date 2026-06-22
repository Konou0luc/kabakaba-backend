import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCampusDto {
  @ApiProperty({ example: 'Campus Paris' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'Paris' })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: 'Université Paris 1' })
  @IsNotEmpty()
  @IsString()
  institution: string;
}
