import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SetPayoutNumberDto {
  @ApiProperty({
    example: '+22890000000',
    description: 'Numéro mobile money par défaut',
  })
  @IsString()
  payoutNumber: string;
}
