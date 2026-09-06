import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../../database/services/prisma.service';

interface DistributedThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Storage distribué PostgreSQL pour @nestjs/throttler.
 *
 * Le storage mémoire natif de @nestjs/throttler est propre à chaque instance
 * Node.js. Sur Vercel, plusieurs instances peuvent donc avoir des compteurs
 * différents. Cette implémentation conserve les compteurs dans PostgreSQL,
 * qui reste partagé entre les instances.
 */
@Injectable()
export class DistributedThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly prisma: PrismaService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<DistributedThrottlerStorageRecord> {
    const now = Date.now();
    const ttlMs = Math.max(1, ttl);
    const blockMs = Math.max(1, blockDuration);
    const windowStartMs = Math.floor(now / ttlMs) * ttlMs;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + ttlMs);
    // La clé primaire inclut la fenêtre temporelle : aucune course entre
    // deux fenêtres et un UPSERT atomique suffit pour compter les requêtes.
    const rows = await this.prisma.$queryRaw<Array<{
      total_hits: number;
      blocked_until: Date | null;
      expires_at: Date;
    }>>`
      INSERT INTO "RateLimitBucket"
        ("key", "throttlerName", "windowStart", "totalHits", "blockedUntil", "expiresAt", "createdAt", "updatedAt")
      VALUES
        (${key}, ${throttlerName}, ${windowStart}, 1, NULL, ${expiresAt}, NOW(), NOW())
      ON CONFLICT ("key", "throttlerName", "windowStart")
      DO UPDATE SET
        "totalHits" = "RateLimitBucket"."totalHits" + 1,
        "updatedAt" = NOW()
      RETURNING "totalHits" AS total_hits, "blockedUntil" AS blocked_until, "expiresAt" AS expires_at
    `;

    const row = rows[0];
    const totalHits = Number(row?.total_hits ?? 1);
    let blockedUntil = row?.blocked_until ? new Date(row.blocked_until) : null;

    if (totalHits > limit && (!blockedUntil || blockedUntil.getTime() <= now)) {
      blockedUntil = new Date(now + blockMs);
      await this.prisma.$executeRaw`
        UPDATE "RateLimitBucket"
        SET "blockedUntil" = ${blockedUntil}, "updatedAt" = NOW()
        WHERE "key" = ${key}
          AND "throttlerName" = ${throttlerName}
          AND "windowStart" = ${windowStart}
      `;
    }

    // Nettoyage probabiliste léger : évite que la table grossisse indéfiniment
    // sans ajouter un DELETE à chaque requête.
    if (Math.random() < 0.01) {
      await this.prisma.$executeRaw`
        DELETE FROM "RateLimitBucket"
        WHERE "expiresAt" < NOW()
      `;
    }

    // @nestjs/throttler expects these two values in seconds, while the
    // incoming ttl/blockDuration arguments are milliseconds.
    const timeToExpire = Math.max(0, Math.ceil((expiresAt.getTime() - now) / 1000));
    const timeToBlockExpire = blockedUntil
      ? Math.max(0, Math.ceil((blockedUntil.getTime() - now) / 1000))
      : 0;

    return {
      totalHits,
      timeToExpire,
      isBlocked: timeToBlockExpire > 0,
      timeToBlockExpire,
    };
  }
}
