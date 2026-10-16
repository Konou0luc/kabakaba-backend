import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString } from 'class-validator';
import { NormalizeTogoPhone } from '../../../common/utils/phone-e164';

export class VendorActivateStartDto {
  @ApiProperty({
    example: '+22890000000',
    description: 'Numéro de téléphone du compte vendeur',
  })
  @NormalizeTogoPhone()
  @IsPhoneNumber()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({
    example: 'MotDePasseTemporaire1',
    description:
      'Mot de passe du compte vendeur (temporaire, communiqué par un administrateur à la création du compte)',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
