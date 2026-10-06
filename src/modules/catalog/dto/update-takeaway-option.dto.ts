import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTakeawayOptionDto } from './create-takeaway-option.dto';

// SÉCURITÉ : vendorId n'est jamais modifiable après création — sinon la
// vérification de propriété (faite sur l'ANCIEN vendorId) pourrait être
// contournée en déplaçant l'option vers une autre cantine.
export class UpdateTakeawayOptionDto extends PartialType(
  OmitType(CreateTakeawayOptionDto, ['vendorId'] as const),
) {}
