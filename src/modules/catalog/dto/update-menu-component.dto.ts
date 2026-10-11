import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateMenuComponentDto } from './create-menu-component.dto';

// SÉCURITÉ : itemId ne doit jamais être modifiable après création — sinon
// la vérification de propriété (faite sur l'ANCIEN itemId) pourrait être
// contournée en déplaçant le composant vers le menu d'un autre vendeur.
export class UpdateMenuComponentDto extends PartialType(
  OmitType(CreateMenuComponentDto, ['itemId'] as const),
) {}
