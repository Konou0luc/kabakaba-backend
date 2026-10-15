import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import { STUDENT_PIN_LENGTH } from '../constants/student-pin.constants';

export class StudentSetPinDto {
  @ApiProperty({
    description:
      'Jeton d’étape renvoyé par POST /auth/verify-otp lorsque stage = PIN_SETUP_REQUIRED',
  })
  @IsString()
  @IsNotEmpty()
  pinSetupToken!: string;

  @ApiProperty({
    example: '2580',
    description: `Code PIN à ${STUDENT_PIN_LENGTH} chiffres`,
  })
  @IsString()
  @Matches(new RegExp(`^\\d{${STUDENT_PIN_LENGTH}}$`), {
    message: `Le code PIN doit contenir exactement ${STUDENT_PIN_LENGTH} chiffres`,
  })
  pin!: string;
}
