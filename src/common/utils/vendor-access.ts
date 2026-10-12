import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../database/services/prisma.service';

// Utilisateur connecté qui agit sur le catalogue d'une cantine (options d'emporté, composants, menus).
export interface VendorActor {
  id: string;
  role: UserRole;
  isAdmin: boolean;
}

const FOREIGN_VENDOR_MESSAGE = 'Cet élément appartient à une autre cantine';

// Résout la cantine possédée par l'utilisateur connecté (rôle VENDOR).
async function resolveOwnVendorId(prisma: PrismaService, actor: VendorActor): Promise<string> {
  const vendor = await prisma.vendor.findUnique({ where: { userId: actor.id } });
  if (!vendor) {
    throw new ForbiddenException('Aucune cantine associée à ce compte vendeur');
  }
  return vendor.id;
}

// Une vendeuse n'agit que sur sa propre cantine (résolue depuis son compte), l'administrateur sur toutes.
// `foreignVendorMessage` : message du refus (403) quand la cantine visée n'est pas celle de la vendeuse.
export async function assertCanActOnVendor(
  prisma: PrismaService,
  vendorId: string,
  actor: VendorActor,
  foreignVendorMessage: string = FOREIGN_VENDOR_MESSAGE,
): Promise<void> {
  if (actor.isAdmin) return;
  const ownVendorId = await resolveOwnVendorId(prisma, actor);
  if (vendorId !== ownVendorId) {
    throw new ForbiddenException(foreignVendorMessage);
  }
}

// vendorId du client ignoré pour une vendeuse ; obligatoire et vérifié pour un administrateur
// (cantine existante et non supprimée).
export async function resolveTargetVendorId(
  prisma: PrismaService,
  dtoVendorId: string | undefined,
  actor: VendorActor,
): Promise<string> {
  if (!actor.isAdmin) return resolveOwnVendorId(prisma, actor);
  if (!dtoVendorId) throw new BadRequestException('vendorId est requis');
  const vendor = await prisma.vendor.findUnique({ where: { id: dtoVendorId, deletedAt: null } });
  if (!vendor) throw new NotFoundException(`Vendor with id ${dtoVendorId} not found`);
  return vendor.id;
}
