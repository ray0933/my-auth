import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../src/repositories/erpOrder.repository');

import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';
import * as erpOrderRepo from '../../../src/repositories/erpOrder.repository';

const app = createApp();
const prisma = createTestPrisma();
let accountingSupervisorRoleId: string;
let salesRepRoleId: string;
let userRoleId: string;

beforeAll(async () => {
  const { accountingSupervisorRole, salesRepRole, userRole } = await setupTestDb(prisma);
  accountingSupervisorRoleId = accountingSupervisorRole.id;
  salesRepRoleId = salesRepRole.id;
  userRoleId = userRole.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function getToken(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  return res.body.data.accessToken;
}

const baseSnapshot = {
  orderDate: new Date('2026-01-01'),
  customerShortName: 'ACME',
  endUser: 'END',
  projectName: 'Proj',
  salesRepName: 'Sales One',
  orderAmountUntaxed: '10000',
  estimatedCostUntaxed: '5000',
};

describe('OrderTracking API', () => {
  it('accounting_supervisor creates an OrderTracking from an ERP snapshot', async () => {
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({
      ...baseSnapshot,
      orderNumber: 'ORD-1001',
      salesRepCode: 'S001',
    });
    await createTestUser(prisma, { email: 'ot-sup1@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const token = await getToken('ot-sup1@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/order-trackings')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: 'ORD-1001', orderType: 'general' });

    expect(res.status).toBe(201);
    expect(res.body.data.orderNumber).toBe('ORD-1001');
    expect(res.body.data.salesRepCode).toBe('S001');
    expect(res.body.data.remainingUninvoicedAmount).toBe('10000');
  });

  it('returns 409 ORDER_TRACKING_DUPLICATE on a repeat order number', async () => {
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({
      ...baseSnapshot,
      orderNumber: 'ORD-DUP',
      salesRepCode: 'S002',
    });
    await createTestUser(prisma, { email: 'ot-sup2@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const token = await getToken('ot-sup2@test.com', 'ValidPass1!');

    await request(app)
      .post('/api/v1/order-trackings')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: 'ORD-DUP', orderType: 'general' });

    const res = await request(app)
      .post('/api/v1/order-trackings')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: 'ORD-DUP', orderType: 'general' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_TRACKING_DUPLICATE');
  });

  it('returns 404 ORDER_NOT_FOUND_IN_ERP when the ERP has no matching order', async () => {
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue(null);
    await createTestUser(prisma, { email: 'ot-sup3@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const token = await getToken('ot-sup3@test.com', 'ValidPass1!');

    const res = await request(app)
      .post('/api/v1/order-trackings')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderNumber: 'ORD-MISSING', orderType: 'general' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND_IN_ERP');
  });

  it('scopes a sales_rep to only their own salesRepCode', async () => {
    await createTestUser(prisma, { email: 'ot-sup4@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('ot-sup4@test.com', 'ValidPass1!');

    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber: 'ORD-SCOPED', salesRepCode: 'S010' });
    await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${supToken}`).send({ orderNumber: 'ORD-SCOPED', orderType: 'general' });

    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber: 'ORD-OTHER', salesRepCode: 'S999' });
    await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${supToken}`).send({ orderNumber: 'ORD-OTHER', orderType: 'general' });

    await createTestUser(prisma, { email: 'ot-rep1@test.com', password: 'ValidPass1!', roleId: salesRepRoleId, employeeCode: 'S010' });
    const repToken = await getToken('ot-rep1@test.com', 'ValidPass1!');

    const listRes = await request(app).get('/api/v1/order-trackings').set('Authorization', `Bearer ${repToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThan(0);
    expect(listRes.body.data.every((o: { salesRepCode: string }) => o.salesRepCode === 'S010')).toBe(true);

    const otherRes = await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${supToken}`).send({ orderNumber: 'ORD-OTHER-2', orderType: 'general' });
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber: 'ORD-OTHER-2', salesRepCode: 'S999' });

    const getForbiddenRes = await request(app)
      .get(`/api/v1/order-trackings/${otherRes.body.data.id}`)
      .set('Authorization', `Bearer ${repToken}`);
    expect(getForbiddenRes.status).toBe(404);
  });

  it('lets accounting_supervisor sync and edit notes/orderType', async () => {
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber: 'ORD-SYNC', salesRepCode: 'S020' });
    await createTestUser(prisma, { email: 'ot-sup5@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const token = await getToken('ot-sup5@test.com', 'ValidPass1!');

    const createRes = await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${token}`).send({ orderNumber: 'ORD-SYNC', orderType: 'general' });
    const id = createRes.body.data.id;

    const patchRes = await request(app)
      .patch(`/api/v1/order-trackings/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ orderType: 'maintenance', notes: 'call back next week' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.orderType).toBe('maintenance');
    expect(patchRes.body.data.notes).toBe('call back next week');

    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber: 'ORD-SYNC', salesRepCode: 'S020', customerShortName: 'UPDATED' });
    const syncRes = await request(app).post(`/api/v1/order-trackings/${id}/sync`).set('Authorization', `Bearer ${token}`);
    expect(syncRes.status).toBe(200);
    expect(syncRes.body.data.customerShortName).toBe('UPDATED');
    expect(syncRes.body.data.notes).toBe('call back next week'); // untouched by sync
  });

  it('returns 403 FORBIDDEN for the plain user role', async () => {
    await createTestUser(prisma, { email: 'ot-plain1@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('ot-plain1@test.com', 'ValidPass1!');

    const res = await request(app).get('/api/v1/order-trackings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
