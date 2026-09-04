import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { Weekday } from '@prisma/client';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateVendorScheduleDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  day: Weekday;

  @ApiProperty({ example: '07:30', description: 'Heure au format HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime doit être au format HH:mm' })
  startTime: string;

  @ApiProperty({ example: '15:00', description: 'Heure au format HH:mm' })
  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime doit être au format HH:mm' })
  endTime: string;
}
