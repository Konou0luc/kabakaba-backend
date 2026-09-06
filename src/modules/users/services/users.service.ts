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

// Champs de modération qu'un ADMIN web peut modifier — jamais l'identité ni
// les identifiants d'un utilisateur (mot de passe, email, téléphone, nom...).
// Décision produit : le dashboard web ne fait QUE lire/afficher des
// informations et modérer des comptes, jamais toucher à ce qui protège le
// compte de l'utilisateur.
const WEB_ADMIN_MODERATION_FIELDS = ['isSuspended', 'suspensionUntil', 'suspensionReason'] as const;

export function sanitize<T extends { password?: string | null }>(user: T) {
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
  async createStaff(
    dto: CreateStaffUserDto,
    actor: Pick<Actor, 'id' | 'kind' | 'role'>,
  ) {
    // Défense en profondeur : la garde du contrôleur limite déjà cette route
    // à SUPER_ADMIN, mais le service doit aussi refuser toute création
    // privilégiée si elle est appelée depuis un autre chemin.
    if (actor.kind !== 'mobile' || actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Seul un SUPER_ADMIN mobile peut créer un compte staff',
      );
    }

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

  async findOne(id: string, actor?: { id: string; isPrivileged: boolean }) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException(`Utilisateur avec l'identifiant ${id} introuvable`);

    // SÉCURITÉ : un utilisateur normal ne peut consulter que son propre
    // profil — évite qu'un étudiant/vendeur puisse voir le profil complet
    // (email, téléphone, campus...) de n'importe qui en devinant son UUID.
    if (actor && !actor.isPrivileged && actor.id !== id) {
      throw new ForbiddenException("Vous n'avez pas accès à ce profil");
    }

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

    const isSelf = actor.id === id;
    const isMobilePrivileged =
      actor.kind === 'mobile' && (actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN);
    const isWebAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    const isWebSupervision = actor.kind === 'web' && actor.role === 'SUPERVISION';

    if (isWebSupervision) {
      // SÉCURITÉ : la supervision web est en lecture seule sur les comptes
      // utilisateurs — elle affiche des informations, elle ne les modifie pas.
      throw new ForbiddenException('La supervision est en lecture seule sur les comptes utilisateurs');
    }

    if (!isSelf && !isMobilePrivileged && !isWebAdmin) {
      throw new ForbiddenException('Vous ne pouvez modifier que votre propre profil');
    }

    let payload: Record<string, any>;
    if (isMobilePrivileged) {
      // Admin/Super admin côté app mobile : accès complet (support utilisateur).
      payload = { ...updateUserDto };
    } else if (isWebAdmin) {
      // SÉCURITÉ : même un admin web ne touche JAMAIS à l'identité ni aux
      // identifiants d'un utilisateur (mot de passe, email, téléphone,
      // nom...) — uniquement des actions de modération (suspension).
      payload = Object.fromEntries(
        Object.entries(updateUserDto).filter(([key]) =>
          (WEB_ADMIN_MODERATION_FIELDS as readonly string[]).includes(key),
        ),
      );
    } else {
      // Utilisateur mobile modifiant son propre profil.
      payload = Object.fromEntries(
        Object.entries(updateUserDto).filter(([key]) =>
          (SELF_UPDATABLE_FIELDS as readonly string[]).includes(key),
        ),
      );
    }

    const isPrivilegedForSuspension = isMobilePrivileged || isWebAdmin;
    const isSuspending = isPrivilegedForSuspension && payload.isSuspended === true && !current.isSuspended;
    const isLifting = isPrivilegedForSuspension && payload.isSuspended === false && current.isSuspended;

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

    if (payload.campusId !== undefined) {
      if (isSelf && current.role !== UserRole.STUDENT) {
        throw new ForbiddenException('Seul un étudiant peut modifier son campus');
      }
      const campus = await this.prisma.campus.findFirst({
        where: { id: payload.campusId, deletedAt: null },
        select: { id: true },
      });
      if (!campus) throw new NotFoundException('Campus invalide ou inexistant');
    }

    const passwordChanged = typeof payload.password === 'string' && payload.password.length > 0;
    if (passwordChanged) {
      payload.password = await bcrypt.hash(payload.password, 10);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id }, data: payload });
      if (passwordChanged) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revoked: false },
          data: { revoked: true },
        });
      }
      return result;
    });
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