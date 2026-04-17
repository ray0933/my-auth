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

async function getToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

describe('GET /api/v1/users/me', () => {
  it('returns user object without password hash', async () => {
    await createTestUser(prisma, { email: 'me@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('me@test.com', 'ValidPass1!');

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('me@test.com');
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates displayName', async () => {
    await createTestUser(prisma, { email: 'update@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('update@test.com', 'ValidPass1!');

    const res = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'My Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('My Name');
  });
});
