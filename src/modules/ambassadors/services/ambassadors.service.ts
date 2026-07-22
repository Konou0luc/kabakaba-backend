import { Injectable, NotFoundException } from '@nestjs/common';
import { AmbassadorLevel, AmbassadorStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateAmbassadorDto } from '../dto/create-ambassador.dto';
import { UpdateAmbassadorDto } from '../dto/update-ambassador.dto';

@Injectable()
export class AmbassadorsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAmbassadorDto: CreateAmbassadorDto) {
    return this.prisma.ambassador.create({
      data: createAmbassadorDto,
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: AmbassadorStatus,
    level?: AmbassadorLevel,
  ) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(level ? { level } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.ambassador.count({
        where,
      }),
      this.prisma.ambassador.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
    const ambassador = await this.prisma.ambassador.findUnique({
      where: { id, deletedAt: null },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur avec l'identifiant ${id} introuvable`);

    return ambassador;
  }

  async findByUserId(userId: string) {
    const ambassador = await this.prisma.ambassador.findUnique({
      where: { userId, deletedAt: null },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur pour l'utilisateur ${userId} introuvable`);

    return ambassador;
  }

  async update(id: string, updateAmbassadorDto: UpdateAmbassadorDto) {
    const existing = await this.findOne(id);

    let promoCode = updateAmbassadorDto.promoCode;
    // Le code promo n'est généré qu'à l'acceptation (cf. maquette DemandesAmbassadeur :
    // "Le code promo est généré uniquement à l'acceptation") : on ne l'auto-génère
    // que si le statut passe à ACTIVE et qu'aucun code n'existe déjà ou n'est fourni.
    if (updateAmbassadorDto.status === AmbassadorStatus.ACTIVE && !existing.promoCode && !promoCode) {
      promoCode = await this.generatePromoCode(existing.userId);
    }

    return this.prisma.ambassador.update({
      where: { id },
      data: {
        ...updateAmbassadorDto,
        ...(promoCode ? { promoCode } : {}),
      },
    });
  }

  private async generatePromoCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const base = (user?.firstName || 'AMB').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'AMB';
    const year = new Date().getFullYear();

    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = attempt === 0 ? '' : `-${Math.floor(100 + Math.random() * 900)}`;
      const candidate = `${base}-${year}${suffix}`;
      const collision = await this.prisma.ambassador.findUnique({ where: { promoCode: candidate } });
      if (!collision) return candidate;
    }
    // Filet de sécurité si 5 tentatives se percutent toutes (extrêmement improbable)
    return `${base}-${year}-${Date.now().toString().slice(-4)}`;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ambassador.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
