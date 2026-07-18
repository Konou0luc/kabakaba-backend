import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;

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
    if (!process.env.DATABASE_URL) {
      return;
    }

    try {
      await this.$connect();
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
