import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';
import { hashToken, generateResetToken } from '../../../src/utils/crypto';

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

describe('Password reset flow', () => {
  it('returns 200 for unknown email (anti-enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
  });

  it('full forgot→reset flow succeeds and old sessions are revoked', async () => {
    const user = await createTestUser(prisma, {
      email: 'resetme@test.com',
      password: 'OldPass1!',
      roleId: userRoleId,
    });

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'resetme@test.com', password: 'OldPass1!' });
    const oldCookies = loginRes.headers['set-cookie'] as string[];

    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'resetme@test.com' });

    const resetTokenRecord = await prisma.passwordResetToken.findFirst({ where: { userId: user.id } });
    expect(resetTokenRecord).toBeTruthy();

    const rawToken = await (async () => {
      const rawToken = generateResetToken();
      const tokenHash = hashToken(rawToken);
      await prisma.passwordResetToken.update({
        where: { id: resetTokenRecord!.id },
        data: { tokenHash },
      });
      return rawToken;
    })();

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: rawToken, newPassword: 'NewPass1!' });
    expect(resetRes.status).toBe(200);

    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookies);
    expect(refreshRes.status).toBe(401);

    const newLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'resetme@test.com', password: 'NewPass1!' });
    expect(newLoginRes.status).toBe(200);
  });
});
