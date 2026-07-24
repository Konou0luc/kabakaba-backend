import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { CreateStaffUserDto } from '../dto/create-staff-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { SuspensionsService } from './suspensions.service';

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
  role?: string;
}

const SELF_UPDATABLE_FIELDS = [
  'firstName',
  'lastName',
  'avatarUrl',
  'password',
  'notifyOrders',
  'notifyAmbassador',
  'notifyPromotions',
] as const;

function sanitize<T extends { password?: string | null }>(user: T) {
  const { password, ...safe } = user;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suspensionsService: SuspensionsService,
  ) {}

  // Auto-inscription publique — rôle toujours forcé à STUDENT.
  async create(createUserDto: CreateUserDto) {
    const hashedPassword = createUserDto.password
      ? await bcrypt.hash(createUserDto.password, 10)
      : undefined;

    const user = await this.prisma.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
        role: UserRole.STUDENT,
      },
    });

    return sanitize(user);
  }

  // Création privilégiée — appelée uniquement depuis un endpoint gardé
  // ADMIN/SUPER_ADMIN.
  async createStaff(dto: CreateStaffUserDto) {
    const hashedPassword = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;

    const user = await this.prisma.user.create({
      data: { ...dto, password: hashedPassword },
    });

    return sanitize(user);
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    role?: UserRole,
    campusId?: string,
    isSuspended?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(role ? { role } : {}),
      ...(campusId ? { campusId } : {}),
      ...(isSuspended !== undefined ? { isSuspended } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, skip, take: limit }),
    ]);

    return {
      data: data.map(sanitize),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable`);
    return sanitize(user);
  }

  // Usage interne uniquement (login) — renvoie le hash, ne jamais exposer
  // directement via un contrôleur.
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor: Actor) {
    const current = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable`);

    const isPrivileged =
      actor.kind === 'web' || actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;

    if (!isPrivileged && actor.id !== id) {
      throw new ForbiddenException('Vous ne pouvez modifier que votre propre profil');
    }

    // Un acteur non privilégié ne peut toucher qu'un sous-ensemble de champs
    // de son propre profil — jamais role, isSuspended, isBanned, campusId...
    const payload: Record<string, any> = isPrivileged
      ? { ...updateUserDto }
      : Object.fromEntries(
          Object.entries(updateUserDto).filter(([key]) =>
            (SELF_UPDATABLE_FIELDS as readonly string[]).includes(key),
          ),
        );

    const isSuspending = isPrivileged && payload.isSuspended === true && !current.isSuspended;
    const isLifting = isPrivileged && payload.isSuspended === false && current.isSuspended;

    if (isSuspending) {
      await this.suspensionsService.suspend({
        studentId: id,
        reason: payload.suspensionReason ?? 'Suspension manuelle',
        trigger: 'MANUAL',
        suspendedUntil: payload.suspensionUntil ? new Date(payload.suspensionUntil) : undefined,
        actor,
      });
    }
    if (isLifting) {
      await this.suspensionsService.lift(id, actor);
    }

    delete payload.isSuspended;
    delete payload.suspensionUntil;
    delete payload.suspensionReason;

    if (payload.password) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    const updated = await this.prisma.user.update({ where: { id }, data: payload });
    return sanitize(updated);
  }

  // Soft delete uniquement — jamais de suppression physique.
  async remove(id: string) {
    await this.findOne(id);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return sanitize(updated);
  }
}