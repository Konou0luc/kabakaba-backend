import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateMenuDto } from './create-menu.dto';

// SÉCURITÉ : vendorId n'est jamais modifiable après création (la vérification de
// propriété porte sur l'ancien vendorId). Si `lines` est fourni, il REMPLACE toute
// la liste des lignes, de façon atomique. `description` peut valoir null pour être retirée.
export class UpdateMenuDto extends PartialType(OmitType(CreateMenuDto, ['vendorId'] as const)) {}
