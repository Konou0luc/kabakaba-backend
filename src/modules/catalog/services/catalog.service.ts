import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { CreateMenuComponentDto } from '../dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from '../dto/update-menu-component.dto';
import { CreateTakeawayOptionDto } from '../dto/create-takeaway-option.dto';
import { UpdateTakeawayOptionDto } from '../dto/update-takeaway-option.dto';
import { UserRole } from '@prisma/client';

export interface CatalogActor {
  id: string;
  role: UserRole;
  isAdmin: boolean;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // Résout le Vendor possédé par l'utilisateur connecté (rôle VENDOR).
  private async resolveOwnVendorId(actor: CatalogActor): Promise<string> {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
    if (!vendor) {
      throw new ForbiddenException("Aucune cantine associée à ce compte vendeur");
    }
    return vendor.id;
  }

  // Menu Items
  async createMenuItem(createMenuItemDto: CreateMenuItemDto, actor: CatalogActor) {
    // SÉCURITÉ : un vendeur ne peut créer un item que pour SA PROPRE cantine —
    // on ignore tout vendorId fourni par le client dans ce cas et on force
    // celui résolu depuis le compte connecté. Seul un admin peut cibler un
    // vendorId arbitraire (ex: création pour le compte d'un vendeur).
    const vendorId = actor.isAdmin ? createMenuItemDto.vendorId : await this.resolveOwnVendorId(actor);

    return this.prisma.menuItem.create({
      data: { ...createMenuItemDto, vendorId },
    });
  }

  async findAllMenuItems(page: number = 1, limit: number = 10, vendorId?: string) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(vendorId ? { vendorId } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.menuItem.count({ where }),
      this.prisma.menuItem.findMany({
        where,
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneMenuItem(id: string) {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id, deletedAt: null },
    });

    if (!menuItem) throw new NotFoundException(`Menu item with id ${id} not found`);

    return menuItem;
  }

  // Vérifie que menuItem appartient bien au vendeur connecté (sauf admin).
  private async assertMenuItemOwnership(id: string, actor: CatalogActor) {
    const menuItem = await this.findOneMenuItem(id);
    if (!actor.isAdmin) {
      const ownVendorId = await this.resolveOwnVendorId(actor);
      if (menuItem.vendorId !== ownVendorId) {
        throw new ForbiddenException("Cet item de menu appartient à une autre cantine");
      }
    }
    return menuItem;
  }

  async updateMenuItem(id: string, updateMenuItemDto: UpdateMenuItemDto, actor: CatalogActor) {
    await this.assertMenuItemOwnership(id, actor);
    // vendorId n'est jamais modifiable via cette route, même par un admin
    // (transférer un item vers une autre cantine n'a pas de sens métier ici).
    const { vendorId, ...safeData } = updateMenuItemDto as any;
    return this.prisma.menuItem.update({
      where: { id },
      data: safeData,
    });
  }

  async removeMenuItem(id: string, actor: CatalogActor) {
    await this.assertMenuItemOwnership(id, actor);
    return this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Menu Components
  // Résout le vendorId propriétaire d'un MenuComponent via son MenuItem parent.
  private async resolveMenuItemVendorId(itemId: string): Promise<string> {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: itemId, deletedAt: null },
      select: { vendorId: true },
    });
    if (!menuItem) throw new NotFoundException(`Menu item with id ${itemId} not found`);
    return menuItem.vendorId;
  }

  private async assertCanActOnItem(itemId: string, actor: CatalogActor) {
    if (actor.isAdmin) return;
    const ownVendorId = await this.resolveOwnVendorId(actor);
    const itemVendorId = await this.resolveMenuItemVendorId(itemId);
    if (itemVendorId !== ownVendorId) {
      throw new ForbiddenException("Cet item de menu appartient à une autre cantine");
    }
  }

  async createMenuComponent(createMenuComponentDto: CreateMenuComponentDto, actor: CatalogActor) {
    await this.assertCanActOnItem(createMenuComponentDto.itemId, actor);
    return this.prisma.menuComponent.create({
      data: createMenuComponentDto,
    });
  }

  async findAllMenuComponents(itemId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      itemId,
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.menuComponent.count({ where }),
      this.prisma.menuComponent.findMany({
        where,
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneMenuComponent(id: string) {
    const menuComponent = await this.prisma.menuComponent.findUnique({
      where: { id, deletedAt: null },
    });

    if (!menuComponent) throw new NotFoundException(`Menu component with id ${id} not found`);

    return menuComponent;
  }

  private async assertMenuComponentOwnership(id: string, actor: CatalogActor) {
    const menuComponent = await this.findOneMenuComponent(id);
    await this.assertCanActOnItem(menuComponent.itemId, actor);
    return menuComponent;
  }

  async updateMenuComponent(id: string, updateMenuComponentDto: UpdateMenuComponentDto, actor: CatalogActor) {
    await this.assertMenuComponentOwnership(id, actor);
    return this.prisma.menuComponent.update({
      where: { id },
      data: updateMenuComponentDto,
    });
  }

  async removeMenuComponent(id: string, actor: CatalogActor) {
    await this.assertMenuComponentOwnership(id, actor);
    return this.prisma.menuComponent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Options d'emporté (propres à une cantine)
  // Même schéma d'autorisation que le catalogue : une vendeuse n'agit que sur
  // sa propre cantine (résolue depuis son compte), l'administrateur sur toutes.
  private async assertCanActOnVendor(vendorId: string, actor: CatalogActor) {
    if (actor.isAdmin) return;
    const ownVendorId = await this.resolveOwnVendorId(actor);
    if (vendorId !== ownVendorId) {
      throw new ForbiddenException('Cette option appartient à une autre cantine');
    }
  }

  async createTakeawayOption(dto: CreateTakeawayOptionDto, actor: CatalogActor) {
    // Comme pour les items : vendorId fourni par le client ignoré pour une
    // vendeuse ; obligatoire et vérifié pour un administrateur.
    let vendorId: string;
    if (actor.isAdmin) {
      if (!dto.vendorId) throw new BadRequestException('vendorId est requis');
      const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId, deletedAt: null } });
      if (!vendor) throw new NotFoundException(`Vendor with id ${dto.vendorId} not found`);
      vendorId = vendor.id;
    } else {
      vendorId = await this.resolveOwnVendorId(actor);
    }
    const { vendorId: _ignored, ...data } = dto;
    return this.prisma.takeawayOption.create({ data: { ...data, vendorId } });
  }

  // Consultable par un étudiant : uniquement les options actives et non supprimées.
  async findActiveTakeawayOptions(vendorId: string, page: number = 1, limit: number = 10) {
    return this.paginateTakeawayOptions({ vendorId, isActive: true, deletedAt: null }, page, limit);
  }

  // Vue de gestion (vendeuse propriétaire ou admin) : actives et inactives,
  // jamais les supprimées.
  async findManagedTakeawayOptions(vendorId: string, actor: CatalogActor, page: number = 1, limit: number = 10) {
    await this.assertCanActOnVendor(vendorId, actor);
    return this.paginateTakeawayOptions({ vendorId, deletedAt: null }, page, limit);
  }

  private async paginateTakeawayOptions(where: Record<string, unknown>, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.takeawayOption.count({ where }),
      this.prisma.takeawayOption.findMany({ where, skip, take: limit, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private async findOneTakeawayOption(id: string) {
    const option = await this.prisma.takeawayOption.findUnique({ where: { id, deletedAt: null } });
    if (!option) throw new NotFoundException(`Takeaway option with id ${id} not found`);
    return option;
  }

  private async assertTakeawayOptionOwnership(id: string, actor: CatalogActor) {
    const option = await this.findOneTakeawayOption(id);
    await this.assertCanActOnVendor(option.vendorId, actor);
    return option;
  }

  async updateTakeawayOption(id: string, dto: UpdateTakeawayOptionDto, actor: CatalogActor) {
    await this.assertTakeawayOptionOwnership(id, actor);
    return this.prisma.takeawayOption.update({ where: { id }, data: dto });
  }

  async removeTakeawayOption(id: string, actor: CatalogActor) {
    await this.assertTakeawayOptionOwnership(id, actor);
    return this.prisma.takeawayOption.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
