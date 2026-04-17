import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS ?? '90', 10);

const dbUrl = process.env.DATABASE_URL ?? 'file:./prisma/dev.db';
const dbPath = dbUrl.replace(/^file:/, '');
const absolutePath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
const adapter = new PrismaBetterSqlite3({ url: absolutePath });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  console.log(`Purged ${result.count} audit log entries older than ${AUDIT_RETENTION_DAYS} days.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
