import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { applyMaterialMetadataCompat } from './prisma-material-compat';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
export const prisma = applyMaterialMetadataCompat(basePrisma);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
