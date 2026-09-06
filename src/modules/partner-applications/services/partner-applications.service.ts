import { Injectable, NotFoundException } from '@nestjs/common';
import { PartnerApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreatePartnerApplicationDto } from '../dto/create-partner-application.dto';
import { UpdatePartnerApplicationDto } from '../dto/update-partner-application.dto';

@Injectable()
export class PartnerApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPartnerApplicationDto: CreatePartnerApplicationDto) {
    await this.prisma.partnerApplication.create({
      data: createPartnerApplicationDto,
    });

    // Endpoint public : ne jamais renvoyer les données de contact ni l'identifiant
    // de la candidature. Cela évite d'exposer inutilement PII et métadonnées
    // pouvant être utilisées pour profiler/énumérer les candidatures.
    return {
      message: 'Votre candidature a été reçue. Notre équipe vous contactera si nécessaire.',
    };
  }

  async findAll(page: number = 1, limit: number = 10, status?: PartnerApplicationStatus) {
    const skip = (page - 1) * limit;
    const where = { ...(status ? { status } : {}) };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.partnerApplication.count({ where }),
      this.prisma.partnerApplication.findMany({
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
    const application = await this.prisma.partnerApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException(`Candidature avec l'identifiant ${id} introuvable`);
    return application;
  }

  async update(id: string, updatePartnerApplicationDto: UpdatePartnerApplicationDto, treatedByWebUserId?: string) {
    await this.findOne(id);
    return this.prisma.partnerApplication.update({
      where: { id },
      data: {
        ...updatePartnerApplicationDto,
        ...(treatedByWebUserId ? { treatedByWebUserId } : {}),
      },
    });
  }
}
