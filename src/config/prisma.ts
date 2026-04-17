import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

function createPrismaClient() {
  const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
  const dbPath = dbUrl.replace(/^file:/, '');
  const absolutePath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  const adapter = new PrismaBetterSqlite3({ url: absolutePath });
  return new PrismaClient({ adapter });
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
