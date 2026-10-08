import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateComponentDto } from './create-component.dto';

// SÉCURITÉ : ni vendorId (contournement de la vérification de propriété) ni
// quantity (elle ne change que par ajustement via PATCH /components/:id/stock).
// Le ValidationPipe global (forbidNonWhitelisted) refuse ces champs avec une 400.
// categoryId et lowStockThreshold peuvent valoir null pour être retirés.
export class UpdateComponentDto extends PartialType(
  OmitType(CreateComponentDto, ['vendorId', 'quantity'] as const),
) {}
