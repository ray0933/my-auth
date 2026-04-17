import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';

const app = createApp();
const prisma = createTestPrisma();
let superAdminRoleId: string;
let adminRoleId: string;
let userRoleId: string;

beforeAll(async () => {
  const { superAdminRole, adminRole, userRole } = await setupTestDb(prisma);
  superAdminRoleId = superAdminRole.id;
  adminRoleId = adminRole.id;
  userRoleId = userRole.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

describe('Admin user management', () => {
  it('admin creates user → 201 + mustChangePassword=true', async () => {
    await createTestUser(prisma, { email: 'adm@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const token = await getToken('adm@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newuser@test.com', roles: ['user'] });

    expect(res.status).toBe(201);
    expect(res.body.data.mustChangePassword).toBe(true);
  });

  it('returns 409 EMAIL_TAKEN on duplicate', async () => {
    await createTestUser(prisma, { email: 'adm2@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const token = await getToken('adm2@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@test.com', roles: ['user'] });

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'dup@test.com', roles: ['user'] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns 403 for non-admin', async () => {
    await createTestUser(prisma, { email: 'notadmin@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('notadmin@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'x@test.com', roles: ['user'] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('super_admin can hard-delete user; admin gets 403', async () => {
    await createTestUser(prisma, { email: 'superadm@test.com', password: 'ValidPass1!', roleId: superAdminRoleId });
    await createTestUser(prisma, { email: 'adm3@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const superToken = await getToken('superadm@test.com', 'ValidPass1!');
    const adminToken = await getToken('adm3@test.com', 'ValidPass1!');

    const createRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${superToken}`)
      .send({ email: 'todelete@test.com', roles: ['user'] });
    const userId = createRes.body.data.id;

    const adminDeleteRes = await request(app)
      .delete(`/api/v1/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDeleteRes.status).toBe(403);

    const superDeleteRes = await request(app)
      .delete(`/api/v1/admin/users/${userId}`)
      .set('Authorization', `Bearer ${superToken}`);
    expect(superDeleteRes.status).toBe(204);
  });

  it('admin can list, get, update, and unlock users', async () => {
    await createTestUser(prisma, { email: 'adm4@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const token = await getToken('adm4@test.com', 'ValidPass1!');

    const createRes = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'managed@test.com', roles: ['user'] });
    const userId = createRes.body.data.id;

    const listRes = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);

    const getRes = await request(app).get(`/api/v1/admin/users/${userId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);

    const updateRes = await request(app)
      .patch(`/api/v1/admin/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Managed User' });
    expect(updateRes.status).toBe(200);

    await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + 60_000) } });
    const unlockRes = await request(app)
      .post(`/api/v1/admin/users/${userId}/unlock`)
      .set('Authorization', `Bearer ${token}`);
    expect(unlockRes.status).toBe(200);
  });
});
