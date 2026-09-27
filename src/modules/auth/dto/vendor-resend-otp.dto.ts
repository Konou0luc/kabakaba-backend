import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VendorResendOtpDto {
  @ApiProperty({
    description: "Jeton d'étape renvoyé par POST /auth/vendor/activate/start",
  })
  @IsString()
  @IsNotEmpty()
  onboardingToken!: string;
}
