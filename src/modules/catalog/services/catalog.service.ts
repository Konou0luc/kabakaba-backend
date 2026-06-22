import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateMenuItemDto } from '../dto/create-menu-item.dto';
import { UpdateMenuItemDto } from '../dto/update-menu-item.dto';
import { CreateMenuComponentDto } from '../dto/create-menu-component.dto';
import { UpdateMenuComponentDto } from '../dto/update-menu-component.dto';
import { CreatePackagingOptionDto } from '../dto/create-packaging-option.dto';
import { UpdatePackagingOptionDto } from '../dto/update-packaging-option.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // Menu Items
  async createMenuItem(createMenuItemDto: CreateMenuItemDto) {
    return this.prisma.menuItem.create({
      data: createMenuItemDto,
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

  async updateMenuItem(id: string, updateMenuItemDto: UpdateMenuItemDto) {
    await this.findOneMenuItem(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: updateMenuItemDto,
    });
  }

  async removeMenuItem(id: string) {
    await this.findOneMenuItem(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Menu Components
  async createMenuComponent(createMenuComponentDto: CreateMenuComponentDto) {
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

  async updateMenuComponent(id: string, updateMenuComponentDto: UpdateMenuComponentDto) {
    await this.findOneMenuComponent(id);
    return this.prisma.menuComponent.update({
      where: { id },
      data: updateMenuComponentDto,
    });
  }

  async removeMenuComponent(id: string) {
    await this.findOneMenuComponent(id);
    return this.prisma.menuComponent.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Packaging Options
  async createPackagingOption(createPackagingOptionDto: CreatePackagingOptionDto) {
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

  async updatePackagingOption(id: string, updatePackagingOptionDto: UpdatePackagingOptionDto) {
    await this.findOnePackagingOption(id);
    return this.prisma.packagingOption.update({
      where: { id },
      data: updatePackagingOptionDto,
    });
  }

  async removePackagingOption(id: string) {
    await this.findOnePackagingOption(id);
    return this.prisma.packagingOption.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
