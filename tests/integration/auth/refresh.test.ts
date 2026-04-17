import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';

const app = createApp();
const prisma = createTestPrisma();
let userRoleId: string;

beforeAll(async () => {
  const { userRole } = await setupTestDb(prisma);
  userRoleId = userRole.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function login(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { accessToken: res.body.data.accessToken as string, cookies: res.headers['set-cookie'] as string[] };
}

describe('POST /api/v1/auth/refresh', () => {
  it('returns new access token and rotates cookie', async () => {
    await createTestUser(prisma, { email: 'refresh@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { cookies } = await login('refresh@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 TOKEN_REVOKED when replaying a revoked refresh token', async () => {
    await createTestUser(prisma, { email: 'replay@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { cookies } = await login('replay@test.com', 'ValidPass1!');

    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_REVOKED');
  });

  it('returns 401 when no refresh token cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });
});
