import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

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

  // CDC 10.2 : pièces requises pour SOUMETTRE la demande, pas optionnelles —
  // "l'étudiant doit compléter son profil avec [...]". Un dossier sans
  // faculté ni carte scolaire ne peut pas être traité par l'Admin web.
  @ApiProperty({
    example: 'Université de Lomé',
    description: 'Institution ou université de l’étudiant.',
  })
  @IsNotEmpty()
  @IsString()
  institution: string;

  // CDC 10.2 : "choisis dans une liste réduite propre à son école (configurée
  // par l'Admin web)" — jamais une chaîne libre. Référence directe vers
  // FacultyList.id, validée côté service contre le campus de l'étudiant.
  @ApiProperty({
    example: 'b3f1c2a4-...-uuid',
    description:
      "Identifiant de la faculté/institut choisie dans la liste configurée pour le campus de l'étudiant (voir GET des facultés du campus).",
  })
  @IsNotEmpty()
  @IsUUID()
  facultyId: string;

  @ApiProperty({
    example: 'https://cdn.example.com/student-card.jpg',
    description: 'URL de la carte étudiante (année en cours) téléversée.',
  })
  @IsNotEmpty()
  @IsString()
  schoolCardUrl: string;
}
