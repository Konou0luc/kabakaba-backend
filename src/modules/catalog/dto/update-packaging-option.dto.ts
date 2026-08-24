import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePackagingOptionDto } from './create-packaging-option.dto';

// SÉCURITÉ : itemId ne doit jamais être modifiable après création (même
// raison que UpdateMenuComponentDto).
export class UpdatePackagingOptionDto extends PartialType(
  OmitType(CreatePackagingOptionDto, ['itemId'] as const),
) {}
