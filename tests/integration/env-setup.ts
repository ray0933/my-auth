import 'dotenv/config';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'sqlserver://localhost:1433;database=authdev_test;user=sa;password=YourStrong@Password1;trustServerCertificate=true';
process.env.NODE_ENV = 'test';
