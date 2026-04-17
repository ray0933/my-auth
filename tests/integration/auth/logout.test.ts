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
  return {
    accessToken: res.body.data.accessToken as string,
    cookies: res.headers['set-cookie'] as string[],
  };
}

describe('POST /api/v1/auth/logout', () => {
  it('clears cookie and revokes token', async () => {
    await createTestUser(prisma, { email: 'logout@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { accessToken, cookies } = await login('logout@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookies);

    expect(res.status).toBe(200);

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies);
    expect(refreshRes.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  it('revokes all sessions', async () => {
    await createTestUser(prisma, { email: 'logoutall@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { accessToken, cookies: cookies1 } = await login('logoutall@test.com', 'ValidPass1!');
    const { cookies: cookies2 } = await login('logoutall@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookies1);

    const r1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies1);
    const r2 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies2);
    expect(r1.status).toBe(401);
    expect(r2.status).toBe(401);
  });
});
