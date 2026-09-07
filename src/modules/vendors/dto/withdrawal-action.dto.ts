import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class WithdrawalReasonDto {
  @ApiProperty({ example: 'Numéro incorrect / transfert impossible', minLength: 3, maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export enum WithdrawalAppealTypeDto {
  NOT_RECEIVED = 'NOT_RECEIVED',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
}

export class CreateWithdrawalAppealDto {
  @ApiProperty({ enum: WithdrawalAppealTypeDto, example: WithdrawalAppealTypeDto.NOT_RECEIVED })
  @IsString()
  @IsNotEmpty()
  type: WithdrawalAppealTypeDto;

  @ApiProperty({ example: "Je n'ai pas reçu le transfert.", minLength: 5, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class ResolveWithdrawalAppealDto {
  @ApiProperty({ example: 'Vérification opérateur effectuée, transfert confirmé.', minLength: 3, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  resolutionNote: string;
}
