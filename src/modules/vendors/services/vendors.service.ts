import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';
import { FindVendorsForAdminQueryDto } from '../dto/find-vendors-for-admin-query.dto';

const SALT_ROUNDS = 10;

interface Actor {
  id: string;
  role: UserRole;
}

// SÉCURITÉ : projection publique — ne renvoie JAMAIS userId, balanceFcfa,
// debtFcfa sur les routes non-authentifiées (GET /vendors, GET /vendors/:id).
const PUBLIC_VENDOR_SELECT = {
  id: true,
  canteenName: true,
  logoUrl: true,
  bannerUrl: true,
  description: true,
  isActive: true,
  isOpen: true,
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
    const { canteenName, campusIds, logoUrl, bannerUrl, description, isActive, isOpen } = canteenDto;

    const campuses = await this.prisma.campus.findMany({ where: { id: { in: campusIds } } });
    if (campuses.length !== campusIds.length) {
      const foundIds = new Set(campuses.map((c) => c.id));
      const missing = campusIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(`Campus introuvable(s) : ${missing.join(', ')}`);
    }

    const hashedPassword = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            phone,
            email,
            password: hashedPassword,
            role: UserRole.VENDOR,
            mustChangePassword: true,
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
            isOpen: isOpen ?? false,
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
   * propriétaire, créance, commandes du jour — jamais exposé aux routes
   * publiques (PUBLIC_VENDOR_SELECT les exclut volontairement).
   */
  async findAllForAdmin(query: FindVendorsForAdminQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };
    if (query.status === 'active') where.isActive = true;
    if (query.status === 'suspended') where.isActive = false;
    if (query.hasDebt === 'true') where.debtFcfa = { gt: 0 };
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
          isOpen: true,
          debtFcfa: true,
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
      isOpen: v.isOpen,
      debtFcfa: Number(v.debtFcfa),
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
  // du vendeur, créance, motif de suspension, campus affiliés en entier.
  async findOneForAdmin(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        canteenName: true,
        logoUrl: true,
        bannerUrl: true,
        description: true,
        debtFcfa: true,
        balanceFcfa: true,
        isActive: true,
        isOpen: true,
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
      debtFcfa: Number(vendor.debtFcfa),
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

    const isAdmin = actor.role === UserRole.ADMIN || actor.role === UserRole.SUPER_ADMIN;
    if (!isAdmin) {
      const ownVendor = await this.prisma.vendor.findUnique({ where: { userId: actor.id } });
      if (!ownVendor || ownVendor.id !== id) {
        throw new ForbiddenException("Vous n'avez pas accès à cette cantine");
      }
    }

    const { campusIds, ...profileFields } = updateVendorDto;

    // isActive passe à false -> on horodate la suspension et on garde le
    // motif transmis. isActive repasse à true -> on efface les deux (compte
    // réactivé, le motif de l'ancienne suspension n'a plus lieu d'être
    // affiché).
    const suspensionFields: { suspendedAt?: Date | null; suspensionReason?: string | null } = {};
    if (profileFields.isActive === false) {
      suspensionFields.suspendedAt = new Date();
      suspensionFields.suspensionReason = profileFields.suspensionReason ?? null;
    } else if (profileFields.isActive === true) {
      suspensionFields.suspendedAt = null;
      suspensionFields.suspensionReason = null;
    }

    if (campusIds) {
      const campuses = await this.prisma.campus.findMany({ where: { id: { in: campusIds } } });
      if (campuses.length !== campusIds.length) {
        const foundIds = new Set(campuses.map((c) => c.id));
        const missing = campusIds.filter((cId) => !foundIds.has(cId));
        throw new NotFoundException(`Campus introuvable(s) : ${missing.join(', ')}`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (campusIds) {
        await tx.vendorCampus.deleteMany({ where: { vendorId: id } });
        await tx.vendorCampus.createMany({
          data: campusIds.map((campusId) => ({ vendorId: id, campusId })),
        });
      }

      return tx.vendor.update({
        where: { id },
        data: { ...profileFields, ...suspensionFields },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vendor.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
