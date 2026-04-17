import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';

const app = createApp();
const prisma = createTestPrisma();
let adminRoleId: string;
let userRoleId: string;

beforeAll(async () => {
  const { adminRole, userRole } = await setupTestDb(prisma);
  adminRoleId = adminRole.id;
  userRoleId = userRole.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getToken(email: string, password: string) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return { token: res.body.data.accessToken as string, cookies: res.headers['set-cookie'] as string[] };
}

describe('Audit log entries', () => {
  it('creates login_success audit log on successful login', async () => {
    await createTestUser(prisma, { email: 'audit1@test.com', password: 'ValidPass1!', roleId: userRoleId });
    await request(app).post('/api/v1/auth/login').send({ email: 'audit1@test.com', password: 'ValidPass1!' });

    const user = await prisma.user.findUnique({ where: { email: 'audit1@test.com' } });
    const log = await prisma.auditLog.findFirst({
      where: { userId: user!.id, eventType: 'login_success' },
    });
    expect(log).toBeTruthy();
  });

  it('creates logout audit log', async () => {
    await createTestUser(prisma, { email: 'audit2@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { token, cookies } = await getToken('audit2@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookies);

    const user = await prisma.user.findUnique({ where: { email: 'audit2@test.com' } });
    const log = await prisma.auditLog.findFirst({
      where: { userId: user!.id, eventType: 'logout' },
    });
    expect(log).toBeTruthy();
  });

  it('creates user_created audit log', async () => {
    await createTestUser(prisma, { email: 'auditadm@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const { token } = await getToken('auditadm@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'auditcreated@test.com', roles: ['user'] });

    const actor = await prisma.user.findUnique({ where: { email: 'auditadm@test.com' } });
    const log = await prisma.auditLog.findFirst({
      where: { userId: actor!.id, eventType: 'user_created' },
    });
    expect(log).toBeTruthy();
  });

  it('creates password_changed audit log', async () => {
    await createTestUser(prisma, { email: 'auditpw@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const { token, cookies } = await getToken('auditpw@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/users/me/change-password')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookies)
      .send({ currentPassword: 'ValidPass1!', newPassword: 'NewPass1!' });

    const user = await prisma.user.findUnique({ where: { email: 'auditpw@test.com' } });
    const log = await prisma.auditLog.findFirst({
      where: { userId: user!.id, eventType: 'password_changed' },
    });
    expect(log).toBeTruthy();
  });
});
