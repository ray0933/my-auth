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

describe('POST /api/v1/auth/login', () => {
  it('returns 200 with access token and cookie on valid credentials', async () => {
    await createTestUser(prisma, { email: 'login@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
    await createTestUser(prisma, { email: 'login2@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login2@test.com', password: 'WrongPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 ACCOUNT_DISABLED for inactive account', async () => {
    await createTestUser(prisma, {
      email: 'disabled@test.com',
      password: 'ValidPass1!',
      roleId: userRoleId,
      isActive: false,
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'disabled@test.com', password: 'ValidPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('returns requiresPasswordChange=true on first login', async () => {
    await createTestUser(prisma, {
      email: 'firstlogin@test.com',
      password: 'ValidPass1!',
      roleId: userRoleId,
      mustChangePassword: true,
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'firstlogin@test.com', password: 'ValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.data.requiresPasswordChange).toBe(true);
  });

  it('locks account after 5 wrong attempts', async () => {
    await createTestUser(prisma, { email: 'lockme@test.com', password: 'ValidPass1!', roleId: userRoleId });

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'lockme@test.com', password: 'WrongPass1!' });
    }

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'lockme@test.com', password: 'ValidPass1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});
