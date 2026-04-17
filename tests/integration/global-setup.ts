import { execSync } from 'child_process';
import path from 'path';

export function setup() {
  const dbPath = path.resolve(process.cwd(), 'prisma/test.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
  });
}

export function teardown() {}
