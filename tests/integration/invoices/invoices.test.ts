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
let salesRepRoleId: string;
let userRoleId: string;

beforeAll(async () => {
  const { accountingSupervisorRole, accountingRole, salesRepRole, userRole } = await setupTestDb(prisma);
  accountingSupervisorRoleId = accountingSupervisorRole.id;
  accountingRoleId = accountingRole.id;
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

/** POST /invoices — invoiceNumber/invoiceDate are user-entered (no server-side
 * auto-numbering), so callers must supply a unique invoiceNumber per issuance. */
function issueInvoiceReq(token: string, invoicePlanId: string, invoiceNumber: string, notes?: string) {
  return request(app)
    .post('/api/v1/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({ invoicePlanId, invoiceNumber, invoiceDate: '2026-08-22', notes });
}

describe('Invoice API', () => {
  it('issues an invoice with 5% tax, using the user-supplied invoice number/date', async () => {
    await createTestUser(prisma, { email: 'inv-sup1@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup1@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3001', '1000');

    const res = await issueInvoiceReq(supToken, planId, 'INV-TEST-3001');

    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNumber).toBe('INV-TEST-3001');
    expect(res.body.data.invoiceDate).toContain('2026-08-22');
    expect(res.body.data.amount).toBe('1000');
    expect(res.body.data.taxAmount).toBe('50');
    expect(res.body.data.totalAmount).toBe('1050');
    expect(res.body.data.orderNumber).toBe('ORD-3001');
    expect(res.body.data.customerShortName).toBe('ACME');
  });

  it('rejects a duplicate invoice number (409)', async () => {
    await createTestUser(prisma, { email: 'inv-sup5@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup5@test.com', 'ValidPass1!');
    const planId1 = await setupPendingPlan(supToken, 'ORD-3005', '100');
    const planId2 = await setupPendingPlan(supToken, 'ORD-3006', '200');

    await issueInvoiceReq(supToken, planId1, 'INV-TEST-DUP');
    const res = await issueInvoiceReq(supToken, planId2, 'INV-TEST-DUP');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_NUMBER_TAKEN');
  });

  it('rejects issuing twice from the same plan line (409)', async () => {
    await createTestUser(prisma, { email: 'inv-sup2@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup2@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3002', '500');

    await issueInvoiceReq(supToken, planId, 'INV-TEST-3002-A');
    const res = await issueInvoiceReq(supToken, planId, 'INV-TEST-3002-B');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVOICE_PLAN_NOT_PENDING');
  });

  it('voids an invoice and allows the plan line to be reissued with a new number', async () => {
    await createTestUser(prisma, { email: 'inv-acct1@test.com', password: 'ValidPass1!', roleId: accountingRoleId });
    const acctToken = await getToken('inv-acct1@test.com', 'ValidPass1!');
    await createTestUser(prisma, { email: 'inv-sup3@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup3@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3003', '200');

    const issueRes = await issueInvoiceReq(acctToken, planId, 'INV-TEST-3003-A');
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

    const reissueRes = await issueInvoiceReq(acctToken, planId, 'INV-TEST-3003-B');
    expect(reissueRes.status).toBe(201);
    expect(reissueRes.body.data.invoiceNumber).not.toBe(issueRes.body.data.invoiceNumber);
  });

  it('permanently deletes an invoice, reverts its plan line, and writes an audit record', async () => {
    await createTestUser(prisma, { email: 'inv-acct2@test.com', password: 'ValidPass1!', roleId: accountingRoleId });
    const acctToken = await getToken('inv-acct2@test.com', 'ValidPass1!');
    await createTestUser(prisma, { email: 'inv-sup4@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup4@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3004', '300');

    const issueRes = await issueInvoiceReq(acctToken, planId, 'INV-TEST-3004-A');
    const invoiceId = issueRes.body.data.id;

    const delRes = await request(app).delete(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${acctToken}`);
    expect(delRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${acctToken}`);
    expect(getRes.status).toBe(404);

    // the plan line should be back to pending and reissuable
    const reissueRes = await issueInvoiceReq(acctToken, planId, 'INV-TEST-3004-B');
    expect(reissueRes.status).toBe(201);

    const auditRows = await prisma.auditLog.findMany({ where: { eventType: 'invoice_deleted' } });
    expect(auditRows.some((r) => r.metadata?.includes(invoiceId))).toBe(true);
  });

  it('includes the related orderNumber/customerShortName when listing invoices', async () => {
    await createTestUser(prisma, { email: 'inv-sup6@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup6@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3007', '100');
    await issueInvoiceReq(supToken, planId, 'INV-TEST-3007');

    const res = await request(app).get('/api/v1/invoices').set('Authorization', `Bearer ${supToken}`);

    expect(res.status).toBe(200);
    const row = res.body.data.find((inv: { invoiceNumber: string }) => inv.invoiceNumber === 'INV-TEST-3007');
    expect(row.orderNumber).toBe('ORD-3007');
    expect(row.customerShortName).toBe('ACME');
  });

  it('accepts notes on creation and lets accounting/accounting_supervisor update them', async () => {
    await createTestUser(prisma, { email: 'inv-sup7@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup7@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3008', '100');

    const issueRes = await issueInvoiceReq(supToken, planId, 'INV-TEST-3008', 'please double-check amount');
    expect(issueRes.status).toBe(201);
    expect(issueRes.body.data.notes).toBe('please double-check amount');
    const invoiceId = issueRes.body.data.id;

    const patchRes = await request(app)
      .patch(`/api/v1/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${supToken}`)
      .send({ notes: 'confirmed, all good' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.notes).toBe('confirmed, all good');

    const getRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${supToken}`);
    expect(getRes.body.data.notes).toBe('confirmed, all good');
  });

  it('rejects sales_rep updating invoice notes (403) — sales_rep is read-only on Invoice', async () => {
    await createTestUser(prisma, { email: 'inv-sup8@test.com', password: 'ValidPass1!', roleId: accountingSupervisorRoleId });
    const supToken = await getToken('inv-sup8@test.com', 'ValidPass1!');
    const planId = await setupPendingPlan(supToken, 'ORD-3009', '100');
    const issueRes = await issueInvoiceReq(supToken, planId, 'INV-TEST-3009');

    await createTestUser(prisma, { email: 'inv-rep1@test.com', password: 'ValidPass1!', roleId: salesRepRoleId, employeeCode: 'S050' });
    const repToken = await getToken('inv-rep1@test.com', 'ValidPass1!');

    const res = await request(app)
      .patch(`/api/v1/invoices/${issueRes.body.data.id}`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ notes: 'trying to sneak an edit' });
    expect(res.status).toBe(403);
  });

  it('returns 403 FORBIDDEN for the plain user role', async () => {
    await createTestUser(prisma, { email: 'inv-plain1@test.com', password: 'ValidPass1!', roleId: userRoleId });
    const token = await getToken('inv-plain1@test.com', 'ValidPass1!');

    const res = await request(app).get('/api/v1/invoices').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
