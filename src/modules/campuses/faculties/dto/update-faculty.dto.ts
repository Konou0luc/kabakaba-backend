import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateFacultyDto {
  @ApiProperty({ required: false, description: 'Désactivée : disparaît de la liste proposée aux étudiants lors de la demande ambassadeur' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
