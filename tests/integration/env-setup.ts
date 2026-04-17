import path from 'path';

const dbPath = path.resolve(process.cwd(), 'prisma/test.db');
process.env.DATABASE_URL = `file:${dbPath}`;
process.env.NODE_ENV = 'test';
