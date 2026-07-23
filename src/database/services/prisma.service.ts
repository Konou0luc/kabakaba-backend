import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function resolveConnectionString(): string | undefined {
  // En production (Vercel), la chaîne de connexion est rangée sous
  // DATABASE_URL_PROD ; en local/dev, sous DATABASE_URL.
  if (process.env.VERCEL) {
    return process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
  }
  return process.env.DATABASE_URL || process.env.DATABASE_URL_PROD;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = resolveConnectionString();

    if (!connectionString) {
      super();
      return;
    }

    try {
      const pool = new Pool({ connectionString });
      const adapter = new PrismaPg(pool);
      super({ adapter } as any);
    } catch (error) {
      console.error('Failed to initialize Prisma adapter:', error);
      super();
    }
  }

  async onModuleInit() {
    const isServerless = Boolean(process.env.VERCEL || process.env.NEST_SERVERLESS === 'true');
    const connectionString = resolveConnectionString();

    if (!connectionString || isServerless) {
      return;
    }

    try {
      await Promise.race([
        this.$connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Prisma connection timed out')), 3000);
        }),
      ]);
    } catch (error) {
      console.error('Prisma connection failed during startup:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      console.error('Prisma disconnect failed:', error);
    }
  }
}