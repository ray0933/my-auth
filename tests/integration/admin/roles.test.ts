import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';

const app = createApp();
const prisma = createTestPrisma();
let superAdminRoleId: string;
let adminRoleId: string;

beforeAll(async () => {
  const { superAdminRole, adminRole } = await setupTestDb(prisma);
  superAdminRoleId = superAdminRole.id;
  adminRoleId = adminRole.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

describe('Admin roles & permissions', () => {
  it('admin can list roles', async () => {
    await createTestUser(prisma, { email: 'roleadm@test.com', password: 'ValidPass1!', roleId: adminRoleId });
    const token = await getToken('roleadm@test.com', 'ValidPass1!');

    const res = await request(app).get('/api/v1/admin/roles').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('super_admin can create, update, delete roles', async () => {
    await createTestUser(prisma, { email: 'rolesadm@test.com', password: 'ValidPass1!', roleId: superAdminRoleId });
    const token = await getToken('rolesadm@test.com', 'ValidPass1!');

    const createRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'test_role', description: 'Test' });
    expect(createRes.status).toBe(201);
    const roleId = createRes.body.data.id;

    const updateRes = await request(app)
      .patch(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated' });
    expect(updateRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(204);
  });

  it('super_admin can assign and revoke permissions on roles', async () => {
    await createTestUser(prisma, { email: 'permadm@test.com', password: 'ValidPass1!', roleId: superAdminRoleId });
    const token = await getToken('permadm@test.com', 'ValidPass1!');

    const roleRes = await request(app)
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'perm_test_role' });
    const roleId = roleRes.body.data.id;

    const permRes = await request(app)
      .post('/api/v1/admin/permissions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'test:perm' });
    const permId = permRes.body.data.id;

    const assignRes = await request(app)
      .post(`/api/v1/admin/roles/${roleId}/permissions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissionId: permId });
    expect(assignRes.status).toBe(200);

    const revokeRes = await request(app)
      .delete(`/api/v1/admin/roles/${roleId}/permissions/${permId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(revokeRes.status).toBe(200);
  });
});
