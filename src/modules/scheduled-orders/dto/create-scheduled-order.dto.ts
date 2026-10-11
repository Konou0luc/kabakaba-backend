import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsISO8601,
  Matches,
} from 'class-validator';
import { ConsumptionMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from '../../orders/dto/create-order-item.dto';
import {
  SCHEDULE_MAX_LEAD_HOURS,
  SCHEDULE_MIN_LEAD_MINUTES,
} from '../scheduled-orders.constants';

/**
 * Même description de la commande que CreateOrderDto (lignes, mode de consommation,
 * option d'emporté), plus l'heure prévue. Aucun prix : il est calculé par le serveur
 * à l'heure prévue, jamais fourni par le client.
 */
export class CreateScheduledOrderDto {
  @ApiProperty({ example: 'vendor-uuid' })
  @IsNotEmpty()
  @IsString()
  vendorId: string;

  @ApiProperty({
    example: '2026-10-11T12:30:00Z',
    description: `Heure prévue (ISO 8601 avec fuseau horaire), entre ${SCHEDULE_MIN_LEAD_MINUTES} minutes et ${SCHEDULE_MAX_LEAD_HOURS} heures dans le futur`,
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(Z|[+-]\d{2}:?\d{2})$/, {
    message: 'scheduledFor doit comporter un fuseau horaire (ex : 2026-10-11T12:30:00Z)',
  })
  scheduledFor: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiProperty({ enum: ConsumptionMode, example: ConsumptionMode.ON_SITE, description: 'Sur place ou à emporter (obligatoire)' })
  @IsEnum(ConsumptionMode)
  consumptionMode: ConsumptionMode;

  @ApiProperty({
    example: 'takeaway-option-uuid',
    required: false,
    description: "Option d'emporté de la cantine : obligatoire si TAKEAWAY, interdite si ON_SITE",
  })
  @IsOptional()
  @IsString()
  takeawayOptionId?: string;
}
