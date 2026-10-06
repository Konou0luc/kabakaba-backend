import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTakeawayOptionDto {
  @ApiProperty({
    example: 'vendor-uuid',
    required: false,
    description: "Ignoré pour une vendeuse (sa propre cantine est utilisée) ; obligatoire pour un administrateur",
  })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ example: 'Take away', description: "Nom libre de l'option d'emporté" })
  @IsNotEmpty()
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 1, description: "Prix de l'option en tickets, ajouté une seule fois au total de la commande" })
  @IsInt()
  @Min(0)
  priceTickets: number;

  @ApiProperty({ example: true, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
