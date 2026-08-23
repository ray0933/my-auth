import 'dotenv/config';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'sqlserver://localhost:1433;database=authdev_test;user=sa;password=YourStrong@Password1;trustServerCertificate=true';
process.env.NODE_ENV = 'test';
// Integration test files legitimately log in many times per run (a fresh user per test
// case, for isolation) — the production login rate limit (RATE_LIMIT_MAX, default 10/min)
// would otherwise throttle test suites unrelated to rate-limiting itself. The dedicated
// rate-limit test (tests/integration/middleware/rate-limit.test.ts) builds its own isolated
// app with a hardcoded limit, so it's unaffected by this override.
process.env.RATE_LIMIT_MAX = '1000';
