import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateMenuDto } from '../dto/create-menu.dto';
import { UpdateMenuDto } from '../dto/update-menu.dto';
import { MenuLineDto } from '../dto/menu-line.dto';
import { menuPriceTickets, menuUnavailableComponents } from '../menu-pricing';

export interface MenusActor {
  id: string;
  role: UserRole;
  isAdmin: boolean;
}

// Les lignes sont chargées avec les composants : prix et disponibilité sont calculés
// à chaque lecture, jamais stockés.
const MENU_INCLUDE = {
  lines: {
    orderBy: { component: { name: 'asc' } },
    include: {
      component: {
        select: { id: true, name: true, unit: true, priceTickets: true, quantity: true, isAvailable: true, deletedAt: true },
      },
    },
  },
} satisfies Prisma.MenuInclude;

type MenuWithLines = Prisma.MenuGetPayload<{ include: typeof MENU_INCLUDE }>;

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Autorisation (même schéma que le module components) ──────────
  // Une vendeuse n'agit que sur sa propre cantine (résolue depuis son compte),
  // l'administrateur sur toutes.

  private async resolveOwnVendorId(actor: MenusActor): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
    if (!vendor) {
      throw new ForbiddenException('Aucune cantine associée à ce compte vendeur');
    }
    return vendor.id;
  }

  private async assertCanActOnVendor(vendorId: string, actor: MenusActor) {
    if (actor.isAdmin) return;
    const ownVendorId = await this.resolveOwnVendorId(actor);
    if (vendorId !== ownVendorId) {
      throw new ForbiddenException('Cet élément appartient à une autre cantine');
    }
  }

  // vendorId du client ignoré pour une vendeuse ; obligatoire et vérifié pour un administrateur.
  private async resolveTargetVendorId(dtoVendorId: string | undefined, actor: MenusActor): Promise<string> {
    if (!actor.isAdmin) return this.resolveOwnVendorId(actor);
    if (!dtoVendorId) throw new BadRequestException('vendorId est requis');
    const vendor = await this.prisma.vendor.findUnique({ where: { id: dtoVendorId, deletedAt: null } });
    if (!vendor) throw new NotFoundException(`Vendor with id ${dtoVendorId} not found`);
    return vendor.id;
  }

  // ─── Validation des lignes ────────────────────────────────────────

  // Au moins une ligne, pas de doublon de composant, composants non supprimés
  // et de la même cantine que le menu. Renvoie les lignes normalisées (quantité par défaut 1).
  private async validateLines(lines: MenuLineDto[], vendorId: string) {
    if (!lines || lines.length === 0) {
      throw new BadRequestException('Un menu doit contenir au moins une ligne');
    }
    const ids = lines.map((line) => line.componentId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Un composant ne peut apparaître que dans une seule ligne');
    }
    const components = await this.prisma.component.findMany({
      where: { id: { in: ids }, vendorId, deletedAt: null },
      select: { id: true },
    });
    if (components.length !== ids.length) {
      throw new BadRequestException("Un ou plusieurs composants n'existent pas dans cette cantine");
    }
    return lines.map((line) => ({ componentId: line.componentId, quantity: line.quantity ?? 1 }));
  }

  // ─── Calcul du prix et de la disponibilité (à la lecture) ─────────

  private toPublicView(menu: MenuWithLines) {
    const priceTickets = menuPriceTickets(menu.lines);
    const missingComponents = menuUnavailableComponents(menu.lines);
    return {
      id: menu.id,
      name: menu.name,
      description: menu.description,
      priceTickets,
      available: menu.isActive && missingComponents.length === 0,
      missingComponents,
      lines: menu.lines.map((line) => ({
        componentId: line.component.id,
        name: line.component.name,
        unit: line.component.unit,
        quantity: line.quantity,
      })),
    };
  }

  private toManagedView(menu: MenuWithLines) {
    return {
      ...this.toPublicView(menu),
      vendorId: menu.vendorId,
      isActive: menu.isActive,
      createdAt: menu.createdAt,
      updatedAt: menu.updatedAt,
    };
  }

  // ─── Routes ───────────────────────────────────────────────────────

  async create(dto: CreateMenuDto, actor: MenusActor) {
    const vendorId = await this.resolveTargetVendorId(dto.vendorId, actor);
    const lines = await this.validateLines(dto.lines, vendorId);
    const menu = await this.prisma.menu.create({
      data: {
        vendorId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
        lines: { create: lines },
      },
      include: MENU_INCLUDE,
    });
    return this.toManagedView(menu);
  }

  // Public (étudiants) : menus actifs et non supprimés.
  async findPublic(vendorId: string) {
    const menus = await this.prisma.menu.findMany({
      where: { vendorId, isActive: true, deletedAt: null },
      include: MENU_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return menus.map((menu) => this.toPublicView(menu));
  }

  // Gestion (vendeuse propriétaire ou admin) : actifs et inactifs, jamais les supprimés.
  async findManaged(vendorId: string, actor: MenusActor) {
    await this.assertCanActOnVendor(vendorId, actor);
    const menus = await this.prisma.menu.findMany({
      where: { vendorId, deletedAt: null },
      include: MENU_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return menus.map((menu) => this.toManagedView(menu));
  }

  private async assertMenuOwnership(id: string, actor: MenusActor) {
    const menu = await this.prisma.menu.findUnique({ where: { id, deletedAt: null } });
    if (!menu) throw new NotFoundException(`Menu with id ${id} not found`);
    await this.assertCanActOnVendor(menu.vendorId, actor);
    return menu;
  }

  async update(id: string, dto: UpdateMenuDto, actor: MenusActor) {
    const menu = await this.assertMenuOwnership(id, actor);

    // Les champs obligatoires ne peuvent pas être mis à null (IsOptional laisse passer null).
    for (const field of ['name', 'isActive', 'lines'] as const) {
      if (dto[field] === null) throw new BadRequestException(`${field} ne peut pas être null`);
    }
    const lines = dto.lines ? await this.validateLines(dto.lines, menu.vendorId) : undefined;

    // Remplacement des lignes et mise à jour du menu dans une seule transaction :
    // en cas d'échec, les anciennes lignes sont conservées.
    await this.prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.menuLine.deleteMany({ where: { menuId: id } });
        await tx.menuLine.createMany({ data: lines.map((line) => ({ menuId: id, ...line })) });
      }
      await tx.menu.update({
        where: { id },
        data: { name: dto.name, description: dto.description, isActive: dto.isActive },
      });
    });

    const updated = await this.prisma.menu.findUnique({ where: { id }, include: MENU_INCLUDE });
    return this.toManagedView(updated!);
  }

  async remove(id: string, actor: MenusActor) {
    await this.assertMenuOwnership(id, actor);
    await this.prisma.menu.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }
}
