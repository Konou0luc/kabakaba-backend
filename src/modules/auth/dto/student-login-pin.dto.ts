import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString, Matches } from 'class-validator';
import { STUDENT_PIN_LENGTH } from '../constants/student-pin.constants';

export class StudentLoginPinDto {
  @ApiProperty({ example: '+22890123456' })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone!: string;

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
