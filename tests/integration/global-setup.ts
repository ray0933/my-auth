import { execSync } from 'child_process';
import 'dotenv/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'sqlserver://localhost:1433;database=authdev_test;user=sa;password=YourStrong@Password1;trustServerCertificate=true';

export function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

export function teardown() {}
