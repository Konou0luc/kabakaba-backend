import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WebUserDeletionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/services/prisma.service';
import { ProvisionWebUserDto } from '../dto/provision-web-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class WebUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private sanitize(webUser: any) {
    const { password, twoFaSecret, twoFaBackupCode, ...safe } = webUser;
    return safe;
  }

  /**
   * Seule la Supervision crée des comptes WebUser — c'est elle qui décide,
   * via le rôle attribué, quelle interface (Supervision ou Admin) le
   * nouveau membre pourra utiliser.
   */
  async provision(dto: ProvisionWebUserDto) {
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

  /** Un compte "supprimé" depuis l'interface est en réalité désactivé + retiré de la liste. */
  async findAll() {
    const webUsers = await this.prisma.webUser.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return webUsers.map((u) => this.sanitize(u));
  }

  /**
   * Étape 1/2 : un membre de la Supervision initie la suppression.
   * Le compte root est protégé et ne peut jamais être ciblé.
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

    return this.prisma.webUserDeletionRequest.create({
      data: {
        targetWebUserId: targetId,
        initiatedByWebUserId: initiatorId,
        reason,
      },
    });
  }

  async findPendingDeletionRequests() {
    return this.prisma.webUserDeletionRequest.findMany({
      where: { status: WebUserDeletionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Étape 2/2 : un AUTRE membre de la Supervision confirme. C'est cette
   * confirmation qui déclenche le soft delete réel (deletedAt + isActive
   * false) — jamais la première étape seule.
   */
  async confirmDeletion(requestId: string, confirmerId: string) {
    const request = await this.prisma.webUserDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Demande ${requestId} introuvable`);
    if (request.status !== WebUserDeletionStatus.PENDING) {
      throw new ConflictException(`Cette demande a déjà été traitée (${request.status})`);
    }
    if (request.initiatedByWebUserId === confirmerId) {
      throw new ForbiddenException(
        'La personne qui confirme doit être différente de celle qui a initié la demande',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.webUser.update({
        where: { id: request.targetWebUserId },
        data: { deletedAt: new Date(), isActive: false },
      });

      return tx.webUserDeletionRequest.update({
        where: { id: requestId },
        data: {
          status: WebUserDeletionStatus.CONFIRMED,
          confirmedByWebUserId: confirmerId,
          confirmedAt: new Date(),
        },
      });
    });
  }

  /** N'importe quel membre de la Supervision peut annuler une demande en attente — c'est le droit de veto symétrique à la confirmation. */
  async cancelDeletion(requestId: string) {
    const request = await this.prisma.webUserDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Demande ${requestId} introuvable`);
    if (request.status !== WebUserDeletionStatus.PENDING) {
      throw new ConflictException(`Cette demande a déjà été traitée (${request.status})`);
    }

    return this.prisma.webUserDeletionRequest.update({
      where: { id: requestId },
      data: { status: WebUserDeletionStatus.CANCELLED, cancelledAt: new Date() },
    });
  }
}
