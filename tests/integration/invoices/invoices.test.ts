import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../../src/repositories/erpOrder.repository');

import { createApp } from '../../../src/app';
import { createTestPrisma, setupTestDb, createTestUser } from '../setup';
import * as erpOrderRepo from '../../../src/repositories/erpOrder.repository';

const app = createApp();
const prisma = createTestPrisma();
let accountingSupervisorRoleId: string;
let accountingRoleId: string;
let userRoleId: string;

beforeAll(async () => {
  const { accountingSupervisorRole, accountingRole, userRole } = await setupTestDb(prisma);
  accountingSupervisorRoleId = accountingSupervisorRole.id;
  accountingRoleId = accountingRole.id;
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
  salesRepCode: 'S050',
  salesRepName: 'Sales Fifty',
  orderAmountUntaxed: '10000',
  estimatedCostUntaxed: '5000',
};

async function setupPendingPlan(supToken: string, orderNumber: string, amount: string): Promise<string> {
  vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue({ ...baseSnapshot, orderNumber });
  const otRes = await request(app).post('/api/v1/order-trackings').set('Authorization', `Bearer ${supToken}`).send({ orderNumber, orderType: 'general' });
  const orderTrackingId = otRes.body.data.id;

  const planRes = await request(app)
    .post(`/api/v1/order-trackings/${orderTrackingId}/invoice-plans`)
    .set('Authorization', `Bearer ${supToken}`)
    .send({ plannedMonth: '2026-07-01', estimatedCompletionDate: '2026-07-01', plannedAmount: amount });

  return planRes.body.data.id as string;
}

describe('Invoice API', () => {
  it('issues an invoice with 5% tax and marks the plan line invoiced', async () => {
    await createTestUser(prisma, { email: 'inv-sup1@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup1@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3001', '1000');

    const res = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${supToken}`).send({ invoicePlanId: planId });

    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(res.body.data.amount).toBe('1000');
    expect(res.body.data.taxAmount).toBe('50');
    expect(res.body.data.totalAmount).toBe('1050');
  });

  it('rejects issuing twice from the same plan line (409)', async () => {
    await createTestUser(prisma, { email: 'inv-sup2@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup2@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3002', '500');

    await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${supToken}`).send({ invoicePlanId: planId });
    const res = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${supToken}`).send({ invoicePlanId: planId });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_PLAN_NOT_PENDING');
  });

  it('voids an invoice and allows the plan line to be reissued with a new number', async () => {
    await createTestUser(prisma, { email: 'inv-acct1@test.com', password: 'ValidPass1!', roleId: accountingRoleId });
    const acctToken = await getToken('inv-acct1@test.com', 'ValidPass1!');
    await createTestUser(prisma, { email: 'inv-sup3@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup3@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3003', '200');

    const issueRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${acctToken}`).send({ invoicePlanId: planId });
    const invoiceId = issueRes.body.data.id;

    const voidRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${acctToken}`)
      .send({ voidReason: 'wrong amount' });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.data.status).toBe('void');

    const secondVoidRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${acctToken}`)
      .send({ voidReason: 'again' });
    expect(secondVoidRes.status).toBe(409);
    expect(secondVoidRes.body.error.code).toBe('INVOICE_ALREADY_VOID');

    const reissueRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${acctToken}`).send({ invoicePlanId: planId });
    expect(reissueRes.status).toBe(201);
    expect(reissueRes.body.data.invoiceNumber).not.toBe(issueRes.body.data.invoiceNumber);
  });

  it('permanently deletes an invoice, reverts its plan line, and writes an audit record', async () => {
    await createTestUser(prisma, { email: 'inv-acct2@test.com', password: 'ValidPass1!', roleId: accountingRoleId });
    const acctToken = await getToken('inv-acct2@test.com', 'ValidPass1!');
    await createTestUser(prisma, { email: 'inv-sup4@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup4@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3004', '300');

    const issueRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${acctToken}`).send({ invoicePlanId: planId });
    const invoiceId = issueRes.body.data.id;

    const delRes = await request(app).delete(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${acctToken}`);
    expect(delRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${acctToken}`);
    expect(getRes.status).toBe(404);

    // the plan line should be back to pending and reissuable
    const reissueRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${acctToken}`).send({ invoicePlanId: planId });
    expect(reissueRes.status).toBe(201);

    const auditRows = await prisma.auditLog.findMany({ where: { eventType: 'invoice_deleted' } });
    expect(auditRows.some((r) => r.metadata?.includes(invoiceId))).toBe(true);
  });

  it('returns 403 FORBIDDEN for the plain user role', async () => {
    await createTestUser(prisma, { email: 'inv-plain1@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('inv-plain1@test.com', 'ValidPass1!');

    const res = await request(app).get('/api/v1/invoices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
