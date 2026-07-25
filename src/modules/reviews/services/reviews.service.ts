import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';

const SORT_MAP: Record<string, { field: string; direction: 'asc' | 'desc' }> = {
  recent: { field: 'createdAt', direction: 'desc' },
  oldest: { field: 'createdAt', direction: 'asc' },
  highest: { field: 'rating', direction: 'desc' },
  lowest: { field: 'rating', direction: 'asc' },
};

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createReviewDto: CreateReviewDto, studentId: string) {
    return this.prisma.review.create({
      data: {
        ...createReviewDto,
        studentId,
      },
    });
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    vendorId?: string,
    rating?: number,
    search?: string,
    sortBy: string = 'recent',
  ) {
    const skip = (page - 1) * limit;
    const where = {
      deletedAt: null,
      ...(vendorId ? { vendorId } : {}),
      ...(rating ? { rating } : {}),
      ...(search ? { comment: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const sort = SORT_MAP[sortBy] ?? SORT_MAP.recent;

    const [total, data] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sort.field]: sort.direction },
        include: {
          student: { select: { firstName: true, lastName: true } },
          vendor: { select: { canteenName: true } },
        },
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
    const review = await this.prisma.review.findUnique({
      where: { id, deletedAt: null },
    });

    if (!review) throw new NotFoundException(`Avis avec l'identifiant ${id} introuvable`);

    return review;
  }

  async update(id: string, updateReviewDto: UpdateReviewDto, studentId: string) {
    await this.findOne(id);
    return this.prisma.review.update({
      where: { id },
      data: updateReviewDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.review.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}