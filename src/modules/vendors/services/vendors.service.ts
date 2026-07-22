import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateVendorDto } from '../dto/create-vendor.dto';
import { UpdateVendorDto } from '../dto/update-vendor.dto';

const SALT_ROUNDS = 10;

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
    const {
      canteenName,
      vendorName,
      phone,
      email,
      temporaryPassword,
      campusIds,
      logoUrl,
      bannerUrl,
      description,
      isActive,
      isOpen,
    } = createVendorDto;

    const [firstName, ...rest] = vendorName.trim().split(/\s+/);
    const lastName = rest.join(' ') || firstName;

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

  async findOne(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id, deletedAt: null },
    });

    if (!vendor) throw new NotFoundException(`Vendor with id ${id} not found`);

    return vendor;
  }

  async update(id: string, updateVendorDto: UpdateVendorDto) {
    await this.findOne(id);
    const { campusIds, ...profileFields } = updateVendorDto;

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
        data: profileFields,
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
