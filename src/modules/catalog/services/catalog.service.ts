import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { CreateMenuComponentDto } from '../dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from '../dto/update-menu-component.dto';
import { CreatePackagingOptionDto } from '../dto/create-packaging-option.dto';
import { UpdatePackagingOptionDto } from '../dto/update-packaging-option.dto';
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

  // Packaging Options
  async createPackagingOption(createPackagingOptionDto: CreatePackagingOptionDto, actor: CatalogActor) {
    await this.assertCanActOnItem(createPackagingOptionDto.itemId, actor);
    return this.prisma.packagingOption.create({
      data: createPackagingOptionDto,
    });
  }

  async findAllPackagingOptions(itemId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      itemId,
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.packagingOption.count({ where }),
      this.prisma.packagingOption.findMany({
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

  async findOnePackagingOption(id: string) {
    const packagingOption = await this.prisma.packagingOption.findUnique({
      where: { id, deletedAt: null },
    });

    if (!packagingOption) throw new NotFoundException(`Packaging option with id ${id} not found`);

    return packagingOption;
  }

  private async assertPackagingOptionOwnership(id: string, actor: CatalogActor) {
    const packagingOption = await this.findOnePackagingOption(id);
    await this.assertCanActOnItem(packagingOption.itemId, actor);
    return packagingOption;
  }

  async updatePackagingOption(id: string, updatePackagingOptionDto: UpdatePackagingOptionDto, actor: CatalogActor) {
    await this.assertPackagingOptionOwnership(id, actor);
    return this.prisma.packagingOption.update({
      where: { id },
      data: updatePackagingOptionDto,
    });
  }

  async removePackagingOption(id: string, actor: CatalogActor) {
    await this.assertPackagingOptionOwnership(id, actor);
    return this.prisma.packagingOption.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
