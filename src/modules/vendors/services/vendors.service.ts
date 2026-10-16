import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, UserRole, VendorCapacity } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { FindVendorsForAdminQueryDto } from '../dto/find-vendors-for-admin-query.dto';
import { SalesGroupBy, SalesQueryDto } from '../dto/sales-query.dto';
import { generateUniqueReferralCode } from '../../referrals/referral-code';
import { toTogoE164 } from '../../../common/utils/phone-e164';

const SALT_ROUNDS = 10;

// Historique des ventes : intervalle par défaut et maximal, en jours UTC.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SALES_DAYS = 30;
const MAX_SALES_DAYS = 366;

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

interface SalesRow {
  periodStart: Date;
  creditedOrders: number;
  collectedTickets: number;
  cancelledOrders: number;
  refundedTickets: number;
}

interface Actor {
  id: string;
  kind: 'mobile' | 'web';
  role: UserRole | string;
}

// SÉCURITÉ : projection publique — ne renvoie JAMAIS userId ni balanceFcfa
// sur les routes non-authentifiées (GET /vendors, GET /vendors/:id).
const PUBLIC_VENDOR_SELECT = {
  id: true,
  canteenName: true,
  logoUrl: true,
  bannerUrl: true,
  description: true,
  isActive: true,
  capacityStatus: true,
  createdAt: true,
} as const;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée le compte vendeur (User) et la cantine (Vendor) dans une seule
   * transaction, à partir du formulaire "Créer une cantine" du dashboard
   * web : aucun userId préexistant, l'admin saisit un mot de passe
   * temporaire que le vendeur devra changer à sa première connexion
   * (cf. User.mustChangePassword + POST /auth/change-password).
   */
  async create(createVendorDto: CreateVendorDto) {
    const { vendor: personDto, canteen: canteenDto } = createVendorDto;
    const { firstName, lastName, phone, email, temporaryPassword } = personDto;
    const { canteenName, campusIds, logoUrl, bannerUrl, description, isActive, capacityStatus } = canteenDto;

    const campuses = await this.prisma.campus.findMany({ where: { id: { in: campusIds } } });
    if (campuses.length !== campusIds.length) {
      const foundIds = new Set(campuses.map((c) => c.id));
      const missing = campusIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(`Campus introuvable(s) : ${missing.join(', ')}`);
    }

    const canonicalPhone = toTogoE164(phone);
    if (!canonicalPhone) {
      throw new BadRequestException(
        'Numéro de téléphone invalide. Utilise un numéro togolais à 8 chiffres.',
      );
    }

    const hashedPassword = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            phone: canonicalPhone,
            email,
            password: hashedPassword,
            role: UserRole.VENDOR,
            mustChangePassword: true,
            referralCode: await generateUniqueReferralCode(tx),
          },
        });

        const vendor = await tx.vendor.create({
          data: {
            userId: user.id,
            canteenName,
            logoUrl,
            bannerUrl,
            description,
            isActive: isActive ?? true,
            capacityStatus: capacityStatus ?? VendorCapacity.CLOSED,
          },
        });

        await tx.vendorCampus.createMany({
          data: campusIds.map((campusId) => ({ vendorId: vendor.id, campusId })),
        });

        return vendor;
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        const target = Array.isArray(error?.meta?.target) ? error.meta.target.join(', ') : 'email/téléphone';
        throw new ConflictException(`Un compte existe déjà avec ce ${target}`);
      }
      throw error;
    }
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.vendor.count({
        where: { deletedAt: null },
      }),
      this.prisma.vendor.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        select: PUBLIC_VENDOR_SELECT,
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

  /**
   * Vue admin enrichie (dashboard web, WebUserRole.ADMIN uniquement) : nom du
   * propriétaire, commandes du jour — jamais exposé aux routes
   * publiques (PUBLIC_VENDOR_SELECT les exclut volontairement).
   */
  async findAllForAdmin(query: FindVendorsForAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'suspended') where.isActive = false;
    if (query.campusId) where.campuses = { some: { campusId: query.campusId } };
    if (query.search) {
      where.OR = [
        { canteenName: { contains: query.search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [total, vendors] = await this.prisma.$transaction([
      this.prisma.vendor.count({ where }),
      this.prisma.vendor.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          canteenName: true,
          isActive: true,
          capacityStatus: true,
          createdAt: true,
          user: { select: { firstName: true, lastName: true } },
          campuses: { select: { campus: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const vendorIds = vendors.map((v) => v.id);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Commandes créées aujourd'hui (jour calendaire), par vendeur — une seule
    // requête groupée plutôt qu'un appel par vendeur affiché.
    const todayOrdersGrouped = vendorIds.length
      ? await this.prisma.order.groupBy({
          by: ['vendorId'],
          where: { vendorId: { in: vendorIds }, createdAt: { gte: todayStart } },
          _count: { _all: true },
        })
      : [];
    const todayOrdersByVendor = new Map(todayOrdersGrouped.map((g) => [g.vendorId, g._count._all]));

    const data = vendors.map((v) => ({
      id: v.id,
      name: v.canteenName,
      owner: [v.user?.firstName, v.user?.lastName].filter(Boolean).join(' ') || null,
      campuses: v.campuses.map((vc) => vc.campus),
      isActive: v.isActive,
      capacityStatus: v.capacityStatus,
      todayOrders: todayOrdersByVendor.get(v.id) ?? 0,
      createdAt: v.createdAt,
    }));

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Détail complet d'une cantine pour la fiche admin (CantineFiche.jsx) :
  // contrairement à findOne() ci-dessous (route publique, vitrine
  // étudiante), on expose ici tout ce dont la gestion a besoin — contact
  // du vendeur, motif de suspension, campus affiliés en entier.
  async findOneForAdmin(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        canteenName: true,
        logoUrl: true,
        bannerUrl: true,
        description: true,
        balanceFcfa: true,
        isActive: true,
        capacityStatus: true,
        suspendedAt: true,
        suspensionReason: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
        campuses: { select: { campus: { select: { id: true, name: true, city: true, institution: true } } } },
      },
    });

    if (!vendor) throw new NotFoundException(`Vendor with id ${id} not found`);

    return {
      ...vendor,
      balanceFcfa: Number(vendor.balanceFcfa),
      campuses: vendor.campuses.map((vc) => vc.campus),
    };
  }

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id, deletedAt: null },
      select: PUBLIC_VENDOR_SELECT,
    });

    if (!vendor) throw new NotFoundException(`Vendor with id ${id} not found`);

    return vendor;
  }

  async update(id: string, updateVendorDto: UpdateVendorDto, actor: Actor) {
    await this.findOne(id);

    const isAdmin = actor.kind === 'web' && actor.role === 'ADMIN';
    if (!isAdmin) {
      const ownVendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
      if (!ownVendor || ownVendor.id !== id) {
        throw new ForbiddenException("Vous n'avez pas accès à cette cantine");
      }
    }

    const { campusIds, isActive, suspensionReason, ...profileFields } = updateVendorDto;

    // La suspension et les affiliations campus sont des attributs
    // administratifs. Un vendeur ne doit jamais pouvoir les modifier, même
    // sur sa propre cantine : sinon il pourrait réactiver une cantine
    // suspendue ou contourner une décision administrative.
    if (!isAdmin && (isActive !== undefined || suspensionReason !== undefined || campusIds !== undefined)) {
      throw new ForbiddenException(
        'Seuls les administrateurs peuvent modifier le statut, la suspension ou les campus affiliés',
      );
    }

    const suspensionFields: { suspendedAt?: Date | null; suspensionReason?: string | null } = {};
    if (isAdmin && isActive === false) {
      suspensionFields.suspendedAt = new Date();
      suspensionFields.suspensionReason = suspensionReason ?? null;
    } else if (isAdmin && isActive === true) {
      suspensionFields.suspendedAt = null;
      suspensionFields.suspensionReason = null;
    }

    if (isAdmin && campusIds) {
      const campuses = await this.prisma.campus.findMany({ where: { id: { in: campusIds } } });
      if (campuses.length !== campusIds.length) {
        const foundIds = new Set(campuses.map((c) => c.id));
        const missing = campusIds.filter((cId) => !foundIds.has(cId));
        throw new NotFoundException(`Campus introuvable(s) : ${missing.join(', ')}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (isAdmin && campusIds) {
        await tx.vendorCampus.deleteMany({ where: { vendorId: id } });
        await tx.vendorCampus.createMany({
          data: campusIds.map((campusId) => ({ vendorId: id, campusId })),
        });
      }

      return tx.vendor.update({
        where: { id },
        data: { ...profileFields, ...(isAdmin ? { isActive, ...suspensionFields } : {}) },
      });
    });
  }

  /**
   * Profil vendeur connecté — solde, statut de capacité (mobile vendeur).
   */
  /**
   * Ventes de la vendeuse connectée, par période (section 37 du cahier).
   * - Encaissé : commandes READY ou RECEIVED, c'est-à-dire créditées à la vendeuse
   *   (crédit à READY), rattachées à la période par `readyAt` ; 1 ticket = 1 FCFA.
   * - Annulations : commandes CANCELLED de sa cantine, rattachées par `cancelledAt`,
   *   avec le total des tickets remboursés.
   * Périodes en UTC (colonnes `timestamp` sans fuseau, stockées en UTC : aucun
   * calcul dépendant du fuseau de la session). Toutes les périodes de l'intervalle
   * sont renvoyées, y compris celles à zéro ; la première et la dernière peuvent
   * être partielles (semaine ou mois entamés). Requête paramétrée, aucune
   * concaténation de texte : `groupBy` est une valeur d'enum validée.
   */
  async getSales(userId: string, query: SalesQueryDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    if (!vendor) {
      throw new NotFoundException('Profil vendeur introuvable pour ce compte');
    }

    const groupBy = query.groupBy ?? SalesGroupBy.DAY;
    const toDay = startOfUtcDay(query.to ? new Date(query.to) : new Date());
    const fromDay = query.from
      ? startOfUtcDay(new Date(query.from))
      : new Date(toDay.getTime() - (DEFAULT_SALES_DAYS - 1) * DAY_MS);

    if (fromDay.getTime() > toDay.getTime()) {
      throw new BadRequestException('La date de début doit précéder la date de fin');
    }
    const days = Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS) + 1;
    if (days > MAX_SALES_DAYS) {
      throw new BadRequestException(`L'intervalle ne peut pas dépasser ${MAX_SALES_DAYS} jours`);
    }

    // Bornes incluses : du premier instant du jour de début au dernier instant du jour de fin.
    const from = fromDay.toISOString();
    const to = new Date(toDay.getTime() + DAY_MS - 1).toISOString();

    const rows = await this.prisma.$queryRaw<SalesRow[]>`
      WITH periods AS (
        SELECT generate_series(
          date_trunc(${groupBy}, ${from}::timestamp),
          date_trunc(${groupBy}, ${to}::timestamp),
          CASE ${groupBy}
            WHEN 'day' THEN INTERVAL '1 day'
            WHEN 'week' THEN INTERVAL '1 week'
            ELSE INTERVAL '1 month'
          END
        ) AS "periodStart"
      ),
      credited AS (
        SELECT date_trunc(${groupBy}, "readyAt") AS "periodStart",
               COUNT(*)::int AS orders,
               COALESCE(SUM("totalTickets"), 0)::int AS tickets
        FROM "Order"
        WHERE "vendorId" = ${vendor.id}
          AND "deletedAt" IS NULL
          AND "status" IN ('READY', 'RECEIVED')
          AND "readyAt" >= ${from}::timestamp
          AND "readyAt" <= ${to}::timestamp
        GROUP BY 1
      ),
      cancelled AS (
        SELECT date_trunc(${groupBy}, "cancelledAt") AS "periodStart",
               COUNT(*)::int AS orders,
               COALESCE(SUM("refundedTickets"), 0)::int AS tickets
        FROM "Order"
        WHERE "vendorId" = ${vendor.id}
          AND "deletedAt" IS NULL
          AND "status" = 'CANCELLED'
          AND "cancelledAt" >= ${from}::timestamp
          AND "cancelledAt" <= ${to}::timestamp
        GROUP BY 1
      )
      SELECT p."periodStart" AS "periodStart",
             COALESCE(c.orders, 0)::int AS "creditedOrders",
             COALESCE(c.tickets, 0)::int AS "collectedTickets",
             COALESCE(x.orders, 0)::int AS "cancelledOrders",
             COALESCE(x.tickets, 0)::int AS "refundedTickets"
      FROM periods p
      LEFT JOIN credited c ON c."periodStart" = p."periodStart"
      LEFT JOIN cancelled x ON x."periodStart" = p."periodStart"
      ORDER BY p."periodStart"
    `;

    const periods = rows.map((r) => ({
      periodStart: r.periodStart.toISOString(),
      creditedOrders: r.creditedOrders,
      collectedTickets: r.collectedTickets,
      cancelledOrders: r.cancelledOrders,
      refundedTickets: r.refundedTickets,
    }));

    return {
      from,
      to,
      groupBy,
      summary: {
        creditedOrders: periods.reduce((s, p) => s + p.creditedOrders, 0),
        collectedTickets: periods.reduce((s, p) => s + p.collectedTickets, 0),
        cancelledOrders: periods.reduce((s, p) => s + p.cancelledOrders, 0),
        refundedTickets: periods.reduce((s, p) => s + p.refundedTickets, 0),
      },
      periods,
    };
  }

  async findMe(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        canteenName: true,
        logoUrl: true,
        bannerUrl: true,
        description: true,
        balanceFcfa: true,
        isActive: true,
        capacityStatus: true,
        suspendedAt: true,
        suspensionReason: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { phone: true } },
        campuses: {
          select: { campus: { select: { id: true, name: true, city: true, institution: true } } },
        },
      },
    });
    if (!vendor) {
      throw new NotFoundException('Profil vendeur introuvable pour ce compte');
    }

    // CDC §38 : montants en attente = commandes confirmées / en préparation
    // (créditées au solde uniquement au passage à « Prête »).
    const pending = await this.prisma.order.aggregate({
      where: {
        vendorId: vendor.id,
        deletedAt: null,
        status: { in: [OrderStatus.CONFIRMED, OrderStatus.IN_PREPARATION] },
      },
      _sum: { totalTickets: true },
      _count: { _all: true },
    });

    return {
      ...vendor,
      balanceFcfa: Number(vendor.balanceFcfa),
      pendingAmountTickets: pending._sum.totalTickets ?? 0,
      pendingOrdersCount: pending._count._all,
      campuses: vendor.campuses.map((vc) => vc.campus),
      campusName: vendor.campuses[0]?.campus.name ?? '',
      phone: vendor.user?.phone ?? null,
    };
  }

  /**
   * Le vendeur ne peut modifier que le statut de capacité de sa cantine et les champs
   * de présentation (pas isActive / campuses — réservés admin).
   */
  async updateMe(userId: string, dto: { capacityStatus?: VendorCapacity; description?: string; logoUrl?: string; bannerUrl?: string; canteenName?: string }) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId } });
    if (!vendor || vendor.deletedAt) {
      throw new NotFoundException('Profil vendeur introuvable pour ce compte');
    }
    if (!vendor.isActive) {
      throw new ForbiddenException('Compte vendeur inactif — modification impossible');
    }

    const data: Record<string, unknown> = {};
    if (dto.capacityStatus !== undefined) data.capacityStatus = dto.capacityStatus;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    if (dto.canteenName !== undefined) data.canteenName = dto.canteenName;

    const updated = await this.prisma.vendor.update({
      where: { id: vendor.id },
      data,
    });
    return {
      ...updated,
      balanceFcfa: Number(updated.balanceFcfa),
    };
  }

}
