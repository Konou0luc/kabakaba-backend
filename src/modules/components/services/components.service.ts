import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateComponentCategoryDto } from '../dto/create-component-category.dto';
import { UpdateComponentCategoryDto } from '../dto/update-component-category.dto';
import { CreateComponentDto } from '../dto/create-component.dto';
import { UpdateComponentDto } from '../dto/update-component.dto';
import { AdjustStockDto } from '../dto/adjust-stock.dto';
import { VendorNotificationsService } from '../../notifications/services/vendor-notifications.service';
import { hasCrossedLowStockThreshold } from '../../notifications/low-stock';
import { assertCanActOnVendor, resolveTargetVendorId, VendorActor } from '../../../common/utils/vendor-access';

@Injectable()
export class ComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vendorNotifications: VendorNotificationsService,
  ) {}

  // ─── Catégories ───────────────────────────────────────────────────

  async createCategory(dto: CreateComponentCategoryDto, actor: VendorActor) {
    const vendorId = await resolveTargetVendorId(this.prisma, dto.vendorId, actor);
    return this.prisma.componentCategory.create({ data: { vendorId, name: dto.name } });
  }

  // Public (étudiants) : catégories non supprimées.
  async findCategories(vendorId: string) {
    return this.prisma.componentCategory.findMany({
      where: { vendorId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertCategoryOwnership(id: string, actor: VendorActor) {
    const category = await this.prisma.componentCategory.findUnique({ where: { id, deletedAt: null } });
    if (!category) throw new NotFoundException(`Component category with id ${id} not found`);
    await assertCanActOnVendor(this.prisma, category.vendorId, actor);
    return category;
  }

  async updateCategory(id: string, dto: UpdateComponentCategoryDto, actor: VendorActor) {
    await this.assertCategoryOwnership(id, actor);
    return this.prisma.componentCategory.update({ where: { id }, data: { name: dto.name } });
  }

  async removeCategory(id: string, actor: VendorActor) {
    await this.assertCategoryOwnership(id, actor);
    const used = await this.prisma.component.count({ where: { categoryId: id, deletedAt: null } });
    if (used > 0) {
      throw new ConflictException(
        `Cette catégorie contient encore ${used} composant(s). Déplacez ou supprimez-les avant de la supprimer.`,
      );
    }
    return this.prisma.componentCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Composants ───────────────────────────────────────────────────

  // La catégorie doit exister (non supprimée) et appartenir à la même vendeuse.
  private async assertCategoryBelongsToVendor(categoryId: string, vendorId: string) {
    const category = await this.prisma.componentCategory.findUnique({ where: { id: categoryId, deletedAt: null } });
    if (!category || category.vendorId !== vendorId) {
      throw new BadRequestException("Cette catégorie n'existe pas pour cette cantine");
    }
  }

  async createComponent(dto: CreateComponentDto, actor: VendorActor) {
    const vendorId = await resolveTargetVendorId(this.prisma, dto.vendorId, actor);
    if (dto.categoryId) await this.assertCategoryBelongsToVendor(dto.categoryId, vendorId);
    const { vendorId: _ignored, ...data } = dto;
    return this.prisma.component.create({ data: { ...data, vendorId } });
  }

  // Public (étudiants) : jamais la quantité ni le seuil. Les composants
  // indisponibles sont inclus (available: false) : l'étudiant doit les voir.
  async findPublicComponents(vendorId: string) {
    const rows = await this.prisma.component.findMany({
      where: { vendorId, deletedAt: null },
      select: { id: true, name: true, categoryId: true, unit: true, priceTickets: true, isAvailable: true, quantity: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ isAvailable, quantity, ...rest }) => ({ ...rest, available: isAvailable && quantity > 0 }));
  }

  // Gestion (vendeuse propriétaire ou admin) : tous les champs, jamais les supprimés.
  async findManagedComponents(vendorId: string, actor: VendorActor) {
    await assertCanActOnVendor(this.prisma, vendorId, actor);
    return this.prisma.component.findMany({
      where: { vendorId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async assertComponentOwnership(id: string, actor: VendorActor) {
    const component = await this.prisma.component.findUnique({ where: { id, deletedAt: null } });
    if (!component) throw new NotFoundException(`Component with id ${id} not found`);
    await assertCanActOnVendor(this.prisma, component.vendorId, actor);
    return component;
  }

  async updateComponent(id: string, dto: UpdateComponentDto, actor: VendorActor) {
    const component = await this.assertComponentOwnership(id, actor);

    // Les champs obligatoires ne peuvent pas être mis à null (IsOptional laisse passer null).
    for (const field of ['name', 'unit', 'priceTickets', 'isAvailable'] as const) {
      if (dto[field] === null) throw new BadRequestException(`${field} ne peut pas être null`);
    }
    if (dto.categoryId) await this.assertCategoryBelongsToVendor(dto.categoryId, component.vendorId);

    const data: Prisma.ComponentUncheckedUpdateInput = {
      name: dto.name,
      categoryId: dto.categoryId,
      unit: dto.unit,
      priceTickets: dto.priceTickets,
      isAvailable: dto.isAvailable,
      lowStockThreshold: dto.lowStockThreshold,
    };
    return this.prisma.component.update({ where: { id }, data });
  }

  // Ajustement atomique du stock. Une seule requête SQL, sans lecture préalable :
  // - delta > 0 : incrément ;
  // - delta < 0 : mise à jour conditionnelle (quantity >= |delta|) ; si la condition
  //   n'est plus vraie au moment de l'écriture, rien n'est modifié (P2025 → 409).
  // Un retrait qui fait passer la quantité de « au moins le seuil » à « sous le seuil » envoie une
  // alerte « Stock faible » à la vendeuse (CDC 41) : la quantité d'avant est la quantité renvoyée
  // par l'écriture plus le retrait. Aucune alerte pour un ajout.
  async adjustStock(id: string, dto: AdjustStockDto, actor: VendorActor) {
    await this.assertComponentOwnership(id, actor);

    const amount = Math.abs(dto.delta);
    try {
      // Mise à jour et éventuelle rupture dans la même transaction (CDC 40) : un retrait qui amène
      // la quantité à 0 enregistre une rupture ; un ajout ou un retrait qui laisse du stock, non.
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.component.update({
          where:
            dto.delta > 0
              ? { id, deletedAt: null }
              : { id, deletedAt: null, quantity: { gte: amount } },
          data: { quantity: dto.delta > 0 ? { increment: amount } : { decrement: amount } },
          select: { id: true, quantity: true, name: true, vendorId: true, lowStockThreshold: true },
        });
        if (dto.delta < 0 && row.quantity === 0) {
          await tx.componentRupture.create({ data: { componentId: row.id, vendorId: row.vendorId } });
        }
        return row;
      });
      if (dto.delta < 0 && hasCrossedLowStockThreshold(updated.quantity + amount, updated.quantity, updated.lowStockThreshold)) {
        await this.vendorNotifications.notifyLowStock([
          { vendorId: updated.vendorId, componentId: updated.id, name: updated.name, remaining: updated.quantity },
        ]);
      }
      return { id: updated.id, quantity: updated.quantity };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // Soit le composant vient d'être supprimé, soit le stock est insuffisant.
        const current = await this.prisma.component.findUnique({ where: { id, deletedAt: null }, select: { quantity: true } });
        if (!current) throw new NotFoundException(`Component with id ${id} not found`);
        throw new ConflictException(`Stock insuffisant : ${current.quantity} disponible(s), retrait de ${amount} demandé`);
      }
      throw error;
    }
  }

  async removeComponent(id: string, actor: VendorActor) {
    await this.assertComponentOwnership(id, actor);

    // Un composant utilisé par un menu non supprimé (actif ou non) ne peut pas être supprimé.
    const usedBy = await this.prisma.menuLine.findMany({
      where: { componentId: id, menu: { deletedAt: null } },
      select: { menu: { select: { name: true } } },
    });
    if (usedBy.length > 0) {
      const names = [...new Set(usedBy.map((line) => line.menu.name))].join(', ');
      throw new ConflictException(
        `Ce composant est utilisé par ${usedBy.length > 1 ? 'les menus' : 'le menu'} : ${names}. Retirez-le de ces menus ou supprimez-les d'abord.`,
      );
    }
    return this.prisma.component.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
