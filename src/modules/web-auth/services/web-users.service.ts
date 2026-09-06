import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WebUserDeletionStatus, WebUserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/services/prisma.service';
import { ProvisionWebUserDto } from '../dto/provision-web-user.dto';

const SALT_ROUNDS = 10;
const DELETION_WINDOW_HOURS = 48;

@Injectable()
export class WebUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitize(webUser: any) {
    const { password, twoFaSecret, ...safe } = webUser;
    return safe;
  }

  /**
   * Seule la Supervision crée des comptes WebUser. Le compte est créé
   * INACTIF (isActive: false) — il ne le devient qu'une fois la première
   * connexion entièrement terminée (mot de passe + 2FA vérifiés).
   */
  async provision(dto: ProvisionWebUserDto) {
    if (![WebUserRole.SUPERVISION, WebUserRole.ADMIN].includes(dto.role)) {
      throw new ForbiddenException('Rôle de compte non autorisé');
    }
    const hashedPassword = await bcrypt.hash(dto.temporaryPassword, SALT_ROUNDS);
    try {
      const webUser = await this.prisma.webUser.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          role: dto.role,
          password: hashedPassword,
          mustChangePassword: true,
          isActive: false,
        },
      });
      return this.sanitize(webUser);
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Un compte existe déjà avec cet email');
      }
      throw error;
    }
  }

  /**
   * Retourne TOUS les comptes, y compris désactivés (deletedAt non nul).
   * Cette page sert justement à retrouver et distinguer un compte
   * désactivé d'un compte actif — les masquer romprait cet usage. Le tri
   * met les comptes désactivés en dernier plutôt que de les mélanger.
   */
  async findAll() {
    const webUsers = await this.prisma.webUser.findMany({
      orderBy: [{ deletedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return webUsers.map((u) => this.sanitize(u));
  }

  private async expireIfNeeded(request: { id: string; status: WebUserDeletionStatus; expiresAt: Date }) {
    if (request.status === WebUserDeletionStatus.PENDING && request.expiresAt < new Date()) {
      await this.prisma.webUserDeletionRequest.update({
        where: { id: request.id },
        data: { status: WebUserDeletionStatus.EXPIRED, cancelledAt: new Date() },
      });
      return true;
    }
    return false;
  }

  /**
   * Point d'entrée unique, qui bifurque selon le rôle de la cible :
   * - Cible ADMIN : action immédiate d'un compte Supervision, tracée,
   *   pas de vote (n'importe quel membre de la Supervision peut le faire).
   * - Cible SUPERVISION : vote à la majorité des comptes Supervision actifs
   *   (hors la cible), fenêtre de 48h. Le vote de l'initiateur est ajouté
   *   automatiquement.
   */
  async initiateDeletion(targetId: string, initiatorId: string, reason?: string) {
    const target = await this.prisma.webUser.findUnique({ where: { id: targetId } });
    if (!target || target.deletedAt) throw new NotFoundException(`Compte ${targetId} introuvable`);
    if (target.isRoot) throw new ForbiddenException('Le compte root ne peut pas être supprimé');
    if (target.id === initiatorId) {
      throw new ForbiddenException('Vous ne pouvez pas initier la suppression de votre propre compte');
    }

    const existingPending = await this.prisma.webUserDeletionRequest.findFirst({
      where: { targetWebUserId: targetId, status: WebUserDeletionStatus.PENDING },
    });
    if (existingPending) {
      throw new ConflictException('Une demande de suppression est déjà en attente pour ce compte');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + DELETION_WINDOW_HOURS * 60 * 60 * 1000);

    // ─── Cible ADMIN : exécution immédiate, tracée ───────────────────
    if (target.role === WebUserRole.ADMIN) {
      return this.prisma.$transaction(async (tx) => {
        await tx.webUser.update({
          where: { id: targetId },
          data: { deletedAt: now, isActive: false },
        });

        const request = await tx.webUserDeletionRequest.create({
          data: {
            targetWebUserId: targetId,
            initiatedByWebUserId: initiatorId,
            confirmedByWebUserId: initiatorId,
            reason,
            status: WebUserDeletionStatus.CONFIRMED,
            expiresAt: now,
            confirmedAt: now,
          },
        });

        await tx.webUserDeletionApproval.create({
          data: { requestId: request.id, approverId: initiatorId },
        });

        return request;
      });
    }

    // ─── Cible SUPERVISION : vote à la majorité, fenêtre 48h ─────────
    const eligibleVoters = await this.prisma.webUser.count({
      where: {
        role: WebUserRole.SUPERVISION,
        isActive: true,
        deletedAt: null,
        id: { not: targetId },
      },
    });
    const majorityThreshold = Math.floor(eligibleVoters / 2) + 1;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.webUserDeletionRequest.create({
        data: {
          targetWebUserId: targetId,
          initiatedByWebUserId: initiatorId,
          reason,
          expiresAt,
        },
      });

      await tx.webUserDeletionApproval.create({
        data: { requestId: request.id, approverId: initiatorId },
      });

      // Si l'initiateur suffit déjà à atteindre la majorité (ex: seulement
      // 2 comptes Supervision au total), on exécute tout de suite.
      if (majorityThreshold <= 1) {
        await tx.webUser.update({ where: { id: targetId }, data: { deletedAt: now, isActive: false } });
        return tx.webUserDeletionRequest.update({
          where: { id: request.id },
          data: { status: WebUserDeletionStatus.CONFIRMED, confirmedByWebUserId: initiatorId, confirmedAt: now },
        });
      }

      return request;
    });
  }

  async findPendingDeletionRequests() {
    const requests = await this.prisma.webUserDeletionRequest.findMany({
      where: { status: WebUserDeletionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: { approvals: true },
    });

    for (const r of requests) await this.expireIfNeeded(r);

    // Recharge après expiration éventuelle pour ne renvoyer que les vraies PENDING.
    return this.prisma.webUserDeletionRequest.findMany({
      where: { status: WebUserDeletionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: { approvals: true },
    });
  }

  async getDeletionRequestProgress(requestId: string) {
    const request = await this.prisma.webUserDeletionRequest.findUnique({
      where: { id: requestId },
      include: { approvals: true, targetWebUser: { select: { role: true } } },
    });
    if (!request) throw new NotFoundException(`Demande ${requestId} introuvable`);

    await this.expireIfNeeded(request);

    const eligibleVoters = await this.prisma.webUser.count({
      where: {
        role: WebUserRole.SUPERVISION,
        isActive: true,
        deletedAt: null,
        id: { not: request.targetWebUserId },
      },
    });
    const majorityThreshold = Math.floor(eligibleVoters / 2) + 1;

    return {
      ...request,
      approvalsCount: request.approvals.length,
      majorityThreshold,
      eligibleVoters,
    };
  }

  /**
   * Un membre de la Supervision vote "pour" la suppression d'un compte
   * Supervision. N'existe que pour les demandes ciblant SUPERVISION —
   * les demandes ADMIN sont déjà résolues instantanément à la création.
   */
  async approveDeletion(requestId: string, approverId: string) {
    const request = await this.prisma.webUserDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Demande ${requestId} introuvable`);

    if (await this.expireIfNeeded(request)) {
      throw new ConflictException('Cette demande a expiré (délai de 48h dépassé) et a été annulée automatiquement');
    }
    if (request.status !== WebUserDeletionStatus.PENDING) {
      throw new ConflictException(`Cette demande a déjà été traitée (${request.status})`);
    }
    if (request.targetWebUserId === approverId) {
      throw new ForbiddenException('Vous ne pouvez pas voter sur votre propre suppression');
    }

    const alreadyVoted = await this.prisma.webUserDeletionApproval.findUnique({
      where: { requestId_approverId: { requestId, approverId } },
    });
    if (alreadyVoted) throw new ConflictException('Vous avez déjà voté sur cette demande');

    await this.prisma.webUserDeletionApproval.create({ data: { requestId, approverId } });

    const eligibleVoters = await this.prisma.webUser.count({
      where: {
        role: WebUserRole.SUPERVISION,
        isActive: true,
        deletedAt: null,
        id: { not: request.targetWebUserId },
      },
    });
    const majorityThreshold = Math.floor(eligibleVoters / 2) + 1;
    const approvalsCount = await this.prisma.webUserDeletionApproval.count({ where: { requestId } });

    if (approvalsCount >= majorityThreshold) {
      const now = new Date();
      return this.prisma.$transaction(async (tx) => {
        await tx.webUser.update({
          where: { id: request.targetWebUserId },
          data: { deletedAt: now, isActive: false },
        });
        return tx.webUserDeletionRequest.update({
          where: { id: requestId },
          data: { status: WebUserDeletionStatus.CONFIRMED, confirmedByWebUserId: approverId, confirmedAt: now },
        });
      });
    }

    return this.getDeletionRequestProgress(requestId);
  }

  async cancelDeletion(requestId: string, actorId: string) {
    const [request, actor] = await Promise.all([
      this.prisma.webUserDeletionRequest.findUnique({ where: { id: requestId } }),
      this.prisma.webUser.findUnique({ where: { id: actorId }, select: { id: true, role: true, isActive: true, deletedAt: true } }),
    ]);
    if (!request) throw new NotFoundException(`Demande ${requestId} introuvable`);
    if (!actor || !actor.isActive || actor.deletedAt) throw new ForbiddenException('Compte non autorisé');
    if (request.status !== WebUserDeletionStatus.PENDING) {
      throw new ConflictException(`Cette demande a déjà été traitée (${request.status})`);
    }
    if (request.initiatedByWebUserId !== actorId && actor.role !== WebUserRole.ADMIN) {
      throw new ForbiddenException('Seul l’initiateur ou un administrateur peut annuler cette demande');
    }

    return this.prisma.webUserDeletionRequest.update({
      where: { id: requestId },
      data: { status: WebUserDeletionStatus.CANCELLED, cancelledAt: new Date() },
    });
  }
}