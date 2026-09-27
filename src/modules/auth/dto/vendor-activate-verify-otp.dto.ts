import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class VendorActivateVerifyOtpDto {
  @ApiProperty({
    description: "Jeton d'étape renvoyé par POST /auth/vendor/activate/start",
  })
  @IsString()
  @IsNotEmpty()
  onboardingToken!: string;

  @ApiProperty({
    example: '123456',
    description: 'Code OTP à 6 chiffres reçu par SMS',
  })
  @IsString()
  @Length(6, 6)
  code!: string;
}
