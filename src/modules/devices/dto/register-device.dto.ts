import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { DevicePlatform } from '@prisma/client';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'fcm-or-apns-token-xxx' })
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @ApiProperty({ enum: DevicePlatform, example: 'ANDROID' })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;
}
