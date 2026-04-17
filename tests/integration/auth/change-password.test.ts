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

async function loginAndGetTokens(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { accessToken: res.body.data.accessToken as string, cookie: res.headers['set-cookie'] as string[] };
}

describe('Password change enforcement', () => {
  it('blocks protected routes when mustChangePassword=true', async () => {
    await createTestUser(prisma, {
      email: 'mustchange@test.com',
      password: 'ValidPass1!',
      roleId: userRoleId,
      mustChangePassword: true,
    });
    const { accessToken } = await loginAndGetTokens('mustchange@test.com', 'ValidPass1!');

    const res = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('allows change-password even when mustChangePassword=true', async () => {
    await createTestUser(prisma, {
      email: 'changeok@test.com',
      password: 'ValidPass1!',
      roleId: userRoleId,
      mustChangePassword: true,
    });
    const { accessToken, cookie } = await loginAndGetTokens('changeok@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie)
      .send({ currentPassword: 'ValidPass1!', newPassword: 'NewValidPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('can access protected routes after password change', async () => {
    await createTestUser(prisma, {
      email: 'afterchange@test.com',
      password: 'ValidPass1!',
      roleId: userRoleId,
      mustChangePassword: true,
    });
    const { accessToken: oldToken, cookie } = await loginAndGetTokens('afterchange@test.com', 'ValidPass1!');

    const changeRes = await request(app)
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .set('Cookie', cookie)
      .send({ currentPassword: 'ValidPass1!', newPassword: 'NewValidPass2!' });

    const newToken = changeRes.body.data.accessToken as string;

    const meRes = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${newToken}`);

    expect(meRes.status).toBe(200);
  });
});
