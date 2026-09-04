import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../../../database/services/prisma.service';
import { CreateVendorScheduleDto } from '../dto/create-vendor-schedule.dto';

interface Actor {
  id: string;
  role: UserRole;
}

@Injectable()
export class VendorSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccess(vendorId: string, actor: Actor) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId, deletedAt: null } });
    if (!vendor) throw new NotFoundException(`Vendor with id ${vendorId} not found`);

    // Le guard (Roles/WebRoles) a déjà vérifié que l'appelant a un rôle
    // autorisé sur cette route. Seul un compte VENDOR doit en plus être
    // propriétaire de CETTE cantine précise ; les autres rôles autorisés ici
    // (admin mobile, admin/supervision web) ont un accès de gestion global.
    if (actor.role === UserRole.VENDOR && vendor.userId !== actor.id) {
      throw new ForbiddenException("Vous n'avez pas accès à cette cantine");
    }
    return vendor;
  }

  async findAll(vendorId: string, actor: Actor) {
    await this.assertAccess(vendorId, actor);
    return this.prisma.vendorSchedule.findMany({
      where: { vendorId },
      orderBy: { day: 'asc' },
    });
  }

  async create(vendorId: string, dto: CreateVendorScheduleDto, actor: Actor) {
    await this.assertAccess(vendorId, actor);
    return this.prisma.vendorSchedule.create({
      data: { vendorId, ...dto },
    });
  }

  async remove(vendorId: string, id: string, actor: Actor) {
    await this.assertAccess(vendorId, actor);
    const schedule = await this.prisma.vendorSchedule.findUnique({ where: { id } });
    if (!schedule || schedule.vendorId !== vendorId) {
      throw new NotFoundException(`Plage horaire ${id} introuvable pour cette cantine`);
    }
    return this.prisma.vendorSchedule.delete({ where: { id } });
  }
}
