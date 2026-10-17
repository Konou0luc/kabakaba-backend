import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryService } from '../../../common/media/cloudinary.service';
import { PrismaService } from '../../../database/services/prisma.service';
import { toTogoE164 } from '../../../common/utils/phone-e164';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserRole } from '@prisma/client';
import { SuspensionsService } from './suspensions.service';
import { isStudentProfileComplete } from '../../../common/utils/student-profile';

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
  role?: string;
}

const SELF_UPDATABLE_FIELDS = [
  'firstName',
  'lastName',
  'avatarUrl',
  'notifyOrders',
  'notifyPromotions',
] as const;

// Champs de modération qu'un ADMIN web peut modifier — jamais l'identité ni
// les identifiants d'un utilisateur (mot de passe, email, téléphone, nom...).
// Décision produit : le dashboard web ne fait QUE lire/afficher des
// informations et modérer des comptes, jamais toucher à ce qui protège le
// compte de l'utilisateur.
const WEB_ADMIN_MODERATION_FIELDS = [
  'isSuspended',
  'suspensionUntil',
  'suspensionReason',
] as const;

const HIDDEN_USER_KEYS = [
  'password',
  'pinHash',
  'pinFailedAttempts',
  'pinLockedUntil',
  'pinUpdatedAt',
] as const;

type HiddenUserKey = (typeof HIDDEN_USER_KEYS)[number];

/** Retire les secrets du compte avant tout envoi au client. */
export function sanitize<T extends object>(
  user: T,
): Omit<T, HiddenUserKey> & { hasPin: boolean; profileComplete: boolean } {
  const copy = { ...(user as Record<string, unknown>) };
  const hasPin = Boolean(copy.pinHash);
  const profileComplete = isStudentProfileComplete({
    role: copy.role as string | undefined,
    firstName: copy.firstName as string | null | undefined,
    lastName: copy.lastName as string | null | undefined,
  });
  for (const key of HIDDEN_USER_KEYS) {
    delete copy[key];
  }
  return { ...(copy as Omit<T, HiddenUserKey>), hasPin, profileComplete };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly suspensionsService: SuspensionsService,
    private readonly cloudinary: CloudinaryService,
  ) {}

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
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user)
      throw new NotFoundException(
        `Utilisateur avec l'identifiant ${id} introuvable`,
      );

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

  /**
   * Retrouve un compte par téléphone, quelle que soit la forme saisie à la
   * création (`+228 90 12 34 56`, `90123456`…). Ne réécrit rien : la mise au
   * format canonique se fait après une authentification réussie.
   */
  async findByPhone(phone: string) {
    const canonical = toTogoE164(phone);
    const lookup = canonical ?? phone;

    const exact = await this.prisma.user.findUnique({
      where: { phone: lookup },
    });
    if (exact || !canonical) return exact;

    const national = canonical.slice(4);
    const candidates = await this.prisma.user.findMany({
      where: { phone: { contains: national } },
      take: 20,
    });
    const matches = candidates.filter(
      (user) => toTogoE164(user.phone) === canonical,
    );
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Aligne `User.phone` sur `+228` + 8 chiffres. Indispensable avant l'envoi
   * d'un OTP : le code est rangé sous le numéro tel qu'il est en base, et la
   * vérification relit cette même colonne.
   */
  async canonicalizePhone<T extends { id: string; phone: string | null }>(
    user: T,
  ): Promise<T> {
    const canonical = toTogoE164(user.phone);
    if (!canonical || user.phone === canonical) return user;

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { phone: canonical },
      });
      return { ...user, ...updated };
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ce numéro est déjà associé à un autre compte. Contacte un administrateur kabakaba.',
        );
      }
      throw error;
    }
  }

  async update(id: string, updateUserDto: UpdateUserDto, actor: Actor) {
    const current = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current)
      throw new NotFoundException(
        `Utilisateur avec l'identifiant ${id} introuvable`,
      );

    const isSelf = actor.id === id;
    const isMobilePrivileged = false;
    const isWebAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    const isWebSupervision =
      actor.kind === 'web' && actor.role === 'SUPERVISION';

    if (isWebSupervision) {
      // SÉCURITÉ : la supervision web est en lecture seule sur les comptes
      // utilisateurs — elle affiche des informations, elle ne les modifie pas.
      throw new ForbiddenException(
        'La supervision est en lecture seule sur les comptes utilisateurs',
      );
    }

    if (!isSelf && !isMobilePrivileged && !isWebAdmin) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre profil',
      );
    }

    let payload: UpdateUserDto;
    if (isMobilePrivileged) {
      // Aucun rôle admin n'est émis pour l'application mobile.
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
    const isSuspending =
      isPrivilegedForSuspension &&
      payload.isSuspended === true &&
      !current.isSuspended;
    const isLifting =
      isPrivilegedForSuspension &&
      payload.isSuspended === false &&
      current.isSuspended;

    if (isSuspending) {
      await this.suspensionsService.suspend({
        studentId: id,
        reason: payload.suspensionReason ?? 'Suspension manuelle',
        suspendedUntil: payload.suspensionUntil
          ? new Date(payload.suspensionUntil)
          : undefined,
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
        throw new ForbiddenException(
          'Seul un étudiant peut modifier son campus',
        );
      }
      const campus = await this.prisma.campus.findFirst({
        where: { id: payload.campusId, deletedAt: null },
        select: { id: true },
      });
      if (!campus) throw new NotFoundException('Campus invalide ou inexistant');
    }

    const updated = await this.prisma.user.update({ where: { id }, data: payload });
    return sanitize(updated);
  }

  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    this.cloudinary.assertImage(file);
    const avatarUrl = await this.cloudinary.uploadBuffer(
      file.buffer,
      'kabakaba/avatars',
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });
    return { avatarUrl };
  }

}
