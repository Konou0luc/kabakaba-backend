import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../database/services/prisma.service';
import { CreateReviewDto } from '../dto/create-review.dto';
import { UpdateReviewDto } from '../dto/update-review.dto';

const SORT_MAP: Record<string, { field: string; direction: 'asc' | 'desc' }> = {
  recent: { field: 'createdAt', direction: 'desc' },
  oldest: { field: 'createdAt', direction: 'asc' },
  highest: { field: 'rating', direction: 'desc' },
  lowest: { field: 'rating', direction: 'asc' },
};

// Statuts de commande éligibles à un avis (commande effectivement reçue).
const REVIEW_ELIGIBLE_ORDER_STATUSES = ['RECEIVED', 'AUTO_RECEIVED'];

// SÉCURITÉ : projection publique — ne renvoie jamais les identifiants
// internes studentId/vendorId/orderId sur les routes publiques (GET
// /reviews, GET /reviews/:id).
const PUBLIC_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  student: { select: { firstName: true, lastName: true } },
  vendor: { select: { canteenName: true } },
} as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createReviewDto: CreateReviewDto, studentId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: createReviewDto.orderId },
    });

    if (!order) {
      throw new NotFoundException('Commande introuvable');
    }
    // SÉCURITÉ : empêche un étudiant de créer un avis sur la commande d'un
    // autre étudiant, ou avec un vendorId qui ne correspond pas à la
    // commande réelle.
    if (order.studentId !== studentId) {
      throw new ForbiddenException("Vous ne pouvez laisser un avis que sur vos propres commandes");
    }
    if (order.vendorId !== createReviewDto.vendorId) {
      throw new BadRequestException("Le vendeur indiqué ne correspond pas à cette commande");
    }
    if (!REVIEW_ELIGIBLE_ORDER_STATUSES.includes(order.status)) {
      throw new BadRequestException("Cette commande n'est pas encore éligible à un avis");
    }

    const existing = await this.prisma.review.findUnique({
      where: { orderId: createReviewDto.orderId },
    });
    if (existing) {
      throw new BadRequestException('Un avis existe déjà pour cette commande');
    }

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
        select: PUBLIC_REVIEW_SELECT,
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
      select: PUBLIC_REVIEW_SELECT,
    });

    if (!review) throw new NotFoundException(`Avis avec l'identifiant ${id} introuvable`);

    return review;
  }

  // Usage interne uniquement (update/remove) : a besoin de studentId pour la
  // vérification de propriété — ne jamais exposer directement via un
  // contrôleur, contrairement à findOne() qui est la projection publique.
  private async findOneInternal(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id, deletedAt: null },
    });

    if (!review) throw new NotFoundException(`Avis avec l'identifiant ${id} introuvable`);

    return review;
  }

  async update(id: string, updateReviewDto: UpdateReviewDto, studentId: string) {
    const review = await this.findOneInternal(id);
    // SÉCURITÉ : un étudiant ne peut modifier que son propre avis.
    if (review.studentId !== studentId) {
      throw new ForbiddenException("Vous ne pouvez modifier que vos propres avis");
    }
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