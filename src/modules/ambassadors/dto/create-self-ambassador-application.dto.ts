import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateSelfAmbassadorApplicationDto {
  @ApiProperty({
    example: 'KABA2026',
    required: false,
    description: 'Code promo choisi par l’ambassadeur, si le candidat en a un.',
  })
  @IsOptional()
  @IsString()
  @MinLength(4)
  @Matches(/^[A-Za-z0-9-]+$/)
  promoCode?: string;

  @ApiProperty({
    example: 'Université de Lomé',
    required: false,
    description: 'Institution ou université de l’étudiant.',
  })
  @IsOptional()
  @IsString()
  institution?: string;

  @ApiProperty({
    example: 'Faculté de Sciences',
    required: false,
    description: 'Faculté ou institut de l’étudiant.',
  })
  @IsOptional()
  @IsString()
  faculty?: string;

  @ApiProperty({
    example: 'https://cdn.example.com/student-card.jpg',
    required: false,
    description: 'URL de la carte étudiante téléversée.',
  })
  @IsOptional()
  @IsString()
  schoolCardUrl?: string;
}
