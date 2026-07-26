import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class SetPayrollScheduleDto {
  @ApiProperty({ description: 'Activer le déclenchement automatique mensuel' })
  @IsBoolean()
  isEnabled: boolean;

  @ApiProperty({ example: 1, minimum: 1, maximum: 28, description: 'Jour du mois où la paie se déclenche automatiquement' })
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth: number;
}