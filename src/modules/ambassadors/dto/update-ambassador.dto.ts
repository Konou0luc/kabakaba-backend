import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateAmbassadorDto } from './create-ambassador.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { AmbassadorLevel } from '@prisma/client';

export class UpdateAmbassadorDto extends PartialType(CreateAmbassadorDto) {
  @ApiProperty({ enum: AmbassadorLevel, required: false })
  @IsOptional()
  @IsEnum(AmbassadorLevel)
  level?: AmbassadorLevel;
}
