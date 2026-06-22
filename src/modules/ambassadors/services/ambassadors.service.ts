import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.ambassador.count({
        where: { deletedAt: null },
      }),
      this.prisma.ambassador.findMany({
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
    const ambassador = await this.prisma.ambassador.findUnique({
      where: { id, deletedAt: null },
    });

    if (!ambassador) throw new NotFoundException(`Ambassadeur avec l'identifiant ${id} introuvable`);

    return ambassador;
  }

  async update(id: string, updateAmbassadorDto: UpdateAmbassadorDto) {
    await this.findOne(id);
    return this.prisma.ambassador.update({
      where: { id },
      data: updateAmbassadorDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.ambassador.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
