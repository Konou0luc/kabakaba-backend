import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
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

  // Options d'emporté (propres à une cantine)
  // Une vendeuse n'agit que sur sa propre cantine (résolue depuis son compte),
  // l'administrateur sur toutes.
  private async assertCanActOnVendor(vendorId: string, actor: CatalogActor) {
    if (actor.isAdmin) return;
    const ownVendorId = await this.resolveOwnVendorId(actor);
    if (vendorId !== ownVendorId) {
      throw new ForbiddenException('Cette option appartient à une autre cantine');
    }
  }

  async createTakeawayOption(dto: CreateTakeawayOptionDto, actor: CatalogActor) {
    // vendorId fourni par le client ignoré pour une vendeuse ;
    // obligatoire et vérifié pour un administrateur.
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
