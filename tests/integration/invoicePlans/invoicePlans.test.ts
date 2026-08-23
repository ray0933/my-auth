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
let accountingRoleId: string;

beforeAll(async () => {
  const { accountingSupervisorRole, salesRepRole, accountingRole } = await setupTestDb(prisma);
  accountingSupervisorRoleId = accountingSupervisorRole.id;
  salesRepRoleId = salesRepRole.id;
  accountingRoleId = accountingRole.id;
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

async function createOrderTracking(token: string, orderNumber: string, salesRepCode: string): Promise<string> {
  vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber, salesRepCode });
  const res = await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${token}`).send({ orderNumber, orderType: 'general' });
  return res.body.data.id as string;
}

describe('InvoicePlan API', () => {
  it('creates a plan line with correctly computed ROC month strings', async () => {
    await createTestUser(prisma, { email: 'ip-sup1@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const token = await getToken('ip-sup1@test.com', 'ValidPass1!');
    const orderTrackingId = await createOrderTracking(token, 'ORD-2001', 'S010');

    const res = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${token}`)
      .send({ plannedMonth: '2026-07-15', estimatedCompletionDate: '2026-08-01', plannedAmount: '1000' });

    expect(res.status).toBe(201);
    expect(res.body.data.plannedMonthStr).toBe('115-07');
    expect(res.body.data.estimatedCompletionMonthStr).toBe('115-08');
    expect(res.body.data.status).toBe('pending');
  });

  it("lets a sales_rep edit only notes on their own plan line, 403 otherwise", async () => {
    await createTestUser(prisma, { email: 'ip-sup2@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('ip-sup2@test.com', 'ValidPass1!');
    const orderTrackingId = await createOrderTracking(supToken, 'ORD-2002', 'S020');

    const createRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ plannedMonth: '2026-09-01', estimatedCompletionDate: '2026-09-01', plannedAmount: '500' });
    const planId = createRes.body.data.id;

    await createTestUser(prisma, { email: 'ip-rep1@test.com', password: 'ValidPass1!', roleId: salesRepRoleId, employeeCode: 'S020' });
    const repToken = await getToken('ip-rep1@test.com', 'ValidPass1!');

    const notesRes = await request(app)
      .patch(`/api/v1/invoice-plans/${planId}`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ notes: 'confirmed with customer' });
    expect(notesRes.status).toBe(200);
    expect(notesRes.body.data.notes).toBe('confirmed with customer');

    const forbiddenRes = await request(app)
      .patch(`/api/v1/invoice-plans/${planId}`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ plannedAmount: '999' });
    expect(forbiddenRes.status).toBe(403);
    expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects a sales_rep touching a plan line outside their scope (404)', async () => {
    await createTestUser(prisma, { email: 'ip-sup3@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('ip-sup3@test.com', 'ValidPass1!');
    const orderTrackingId = await createOrderTracking(supToken, 'ORD-2003', 'S030');

    const createRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ plannedMonth: '2026-10-01', estimatedCompletionDate: '2026-10-01', plannedAmount: '200' });
    const planId = createRes.body.data.id;

    await createTestUser(prisma, { email: 'ip-rep2@test.com', password: 'ValidPass1!', roleId: salesRepRoleId, employeeCode: 'S999' });
    const repToken = await getToken('ip-rep2@test.com', 'ValidPass1!');

    const res = await request(app).patch(`/api/v1/invoice-plans/${planId}`).set('Authorization', `Bearer ${repToken}`).send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects accounting entirely — it has no write access to InvoicePlan (403)', async () => {
    await createTestUser(prisma, { email: 'ip-sup4@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('ip-sup4@test.com', 'ValidPass1!');
    const orderTrackingId = await createOrderTracking(supToken, 'ORD-2004', 'S040');

    const createRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ plannedMonth: '2026-11-01', estimatedCompletionDate: '2026-11-01', plannedAmount: '300' });
    const planId = createRes.body.data.id;

    await createTestUser(prisma, { email: 'ip-acct1@test.com', password: 'ValidPass1!', roleId: accountingRoleId });
    const acctToken = await getToken('ip-acct1@test.com', 'ValidPass1!');

    const patchRes = await request(app).patch(`/api/v1/invoice-plans/${planId}`).set('Authorization', `Bearer ${acctToken}`).send({ notes: 'x' });
    expect(patchRes.status).toBe(403);

    const createBlockedRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${acctToken}`)
      .send({ plannedMonth: '2026-11-01', estimatedCompletionDate: '2026-11-01', plannedAmount: '1' });
    expect(createBlockedRes.status).toBe(403);
  });

  it('deletes a pending plan line; rejects non-pending deletion with 409', async () => {
    await createTestUser(prisma, { email: 'ip-sup5@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('ip-sup5@test.com', 'ValidPass1!');
    const orderTrackingId = await createOrderTracking(supToken, 'ORD-2005', 'S050');

    const createRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ plannedMonth: '2026-12-01', estimatedCompletionDate: '2026-12-01', plannedAmount: '400' });
    const planId = createRes.body.data.id;

    const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${supToken}`).send({ invoicePlanId: planId });
    expect(invoiceRes.status).toBe(201);

    const failedDeleteRes = await request(app).delete(`/api/v1/invoice-plans/${planId}`).set('Authorization', `Bearer ${supToken}`);
    expect(failedDeleteRes.status).toBe(409);
    expect(failedDeleteRes.body.error.code).toBe('INVOICE_PLAN_NOT_PENDING');

    const secondPlanRes = await request(app)
      .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ plannedMonth: '2027-01-01', estimatedCompletionDate: '2027-01-01', plannedAmount: '50' });
    const secondPlanId = secondPlanRes.body.data.id;

    const deleteRes = await request(app).delete(`/api/v1/invoice-plans/${secondPlanId}`).set('Authorization', `Bearer ${supToken}`);
    expect(deleteRes.status).toBe(204);
  });
});
