import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateAbuseDto } from '../dto/create-abuse.dto';
import { UpdateAbuseDto } from '../dto/update-abuse.dto';

@Injectable()
export class AbuseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAbuseDto: CreateAbuseDto) {
    return this.prisma.abuseLog.create({
      data: createAbuseDto,
    });
  }

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.abuseLog.count({
        where: { deletedAt: null },
      }),
      this.prisma.abuseLog.findMany({
        where: { deletedAt: null },
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
    const abuse = await this.prisma.abuseLog.findUnique({
      where: { id, deletedAt: null },
    });

    if (!abuse) throw new NotFoundException(`Journal d'abus avec l'identifiant ${id} introuvable`);

    return abuse;
  }

  async update(id: string, updateAbuseDto: UpdateAbuseDto) {
    await this.findOne(id);
    return this.prisma.abuseLog.update({
      where: { id },
      data: updateAbuseDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.abuseLog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
