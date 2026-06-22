import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateAbuseDto } from './create-abuse.dto';
import { IsOptional, IsBoolean, IsInt } from 'class-validator';

export class UpdateAbuseDto extends PartialType(CreateAbuseDto) {
  @ApiProperty({ example: 4, required: false })
  @IsOptional()
  @IsInt()
  count?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  warningSent?: boolean;
}
