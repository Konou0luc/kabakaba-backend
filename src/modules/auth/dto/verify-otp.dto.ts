import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  IsPhoneNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Length,
} from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: '+22890000000', description: 'Numéro de téléphone' })
  @IsPhoneNumber()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123456', description: 'Code OTP à 6 chiffres' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;

  // CDC 42 — champ "Qui t'a invité ?" à l'inscription.
  // Optionnel : son absence ou une chaîne vide signifie "pas de parrain".
  // N'a d'effet QUE lors de la toute première inscription (création du
  // compte) — voir auth.service.ts::verifyOtp. Ignoré silencieusement sur
  // une reconnexion d'un compte déjà existant.
  @ApiPropertyOptional({
    example: 'K7M2QX9A',
    description:
      "Code de parrainage d'un utilisateur (8 caractères, casse et espaces ignorés), saisi uniquement à l'inscription. Laisser vide si aucun.",
  })
  @IsOptional()
  @IsString()
  referralCode?: string;

  // CDC 2.1 — campus d'appartenance à l'inscription (ex. UCAO, UL).
  // Requis uniquement à la première création de compte ; ignoré à la reconnexion.
  @ApiPropertyOptional({
    example: 'uuid-campus',
    description:
      "Identifiant du campus choisi à l'inscription. Requis pour un nouveau compte.",
  })
  @IsOptional()
  @IsUUID()
  campusId?: string;
}
