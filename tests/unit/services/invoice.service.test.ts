import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../../src/repositories/invoice.repository');
vi.mock('../../../src/repositories/invoicePlan.repository');
vi.mock('../../../src/services/sequence.service');
vi.mock('../../../src/services/audit.service');

import * as invoiceRepo from '../../../src/repositories/invoice.repository';
import * as invoicePlanRepo from '../../../src/repositories/invoicePlan.repository';
import * as sequenceService from '../../../src/services/sequence.service';
import * as invoiceService from '../../../src/services/invoice.service';

const mockPlan = {
  id: 'plan-1',
  orderTrackingId: 'ot-1',
  plannedAmount: new Prisma.Decimal('1000'),
  status: 'pending',
} as any;

const mockInvoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-000001',
  orderTrackingId: 'ot-1',
  invoiceDate: new Date(),
  amount: new Prisma.Decimal('1000'),
  taxAmount: new Prisma.Decimal('50'),
  totalAmount: new Prisma.Decimal('1050'),
  status: 'issued',
  voidedAt: null,
  voidReason: null,
  issuedById: 'actor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('invoiceService.issueInvoice', () => {
  it('computes 5% tax and total, and generates an invoice number', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(mockPlan);
    vi.mocked(sequenceService.nextInvoiceNumber).mockResolvedValue('INV-2026-000001');
    vi.mocked(invoiceRepo.create).mockResolvedValue(mockInvoice);
    vi.mocked(invoicePlanRepo.update).mockResolvedValue({ ...mockPlan, status: 'invoiced', invoiceId: 'inv-1' });

    const result = await invoiceService.issueInvoice({ invoicePlanId: 'plan-1' }, 'actor-1');

    expect(result.amount).toBe('1000');
    expect(result.taxAmount).toBe('50');
    expect(result.totalAmount).toBe('1050');
    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', { status: 'invoiced', invoiceId: 'inv-1' });
  });

  it('rounds tax to 2 decimal places (half up)', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue({ ...mockPlan, plannedAmount: new Prisma.Decimal('333.33') });
    vi.mocked(sequenceService.nextInvoiceNumber).mockResolvedValue('INV-2026-000002');
    vi.mocked(invoiceRepo.create).mockImplementation(async (data: any) => ({ ...mockInvoice, ...data }));
    vi.mocked(invoicePlanRepo.update).mockResolvedValue(mockPlan);

    const result = await invoiceService.issueInvoice({ invoicePlanId: 'plan-1' }, 'actor-1');

    // 333.33 * 0.05 = 16.6665 -> rounds to 16.67 (ROUND_HALF_UP)
    expect(result.taxAmount).toBe('16.67');
  });

  it('throws INVOICE_PLAN_NOT_PENDING when the plan is already invoiced', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue({ ...mockPlan, status: 'invoiced' });

    await expect(invoiceService.issueInvoice({ invoicePlanId: 'plan-1' }, 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_PLAN_NOT_PENDING',
    });
  });

  it('throws NOT_FOUND for an unknown plan', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(null);

    await expect(invoiceService.issueInvoice({ invoicePlanId: 'missing' }, 'actor-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('invoiceService.voidInvoice', () => {
  it('voids an issued invoice and reverts the linked plan line to pending', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue(mockInvoice);
    vi.mocked(invoiceRepo.update).mockResolvedValue({ ...mockInvoice, status: 'void' });
    vi.mocked(invoicePlanRepo.findByInvoiceId).mockResolvedValue({ ...mockPlan, status: 'invoiced', invoiceId: 'inv-1' });

    const result = await invoiceService.voidInvoice('inv-1', { voidReason: 'typo' }, 'actor-1');

    expect(result.status).toBe('void');
    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', { status: 'pending', invoiceId: null });
  });

  it('throws INVOICE_ALREADY_VOID for an already-void invoice', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue({ ...mockInvoice, status: 'void' });

    await expect(invoiceService.voidInvoice('inv-1', { voidReason: 'x' }, 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_ALREADY_VOID',
    });
  });

  it('throws NOT_FOUND for an unknown invoice', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue(null);

    await expect(invoiceService.voidInvoice('missing', { voidReason: 'x' }, 'actor-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('invoiceService.deleteInvoice', () => {
  it('writes an audit snapshot, reverts the linked plan, then deletes the row', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue(mockInvoice);
    vi.mocked(invoicePlanRepo.findByInvoiceId).mockResolvedValue({ ...mockPlan, status: 'invoiced', invoiceId: 'inv-1' });

    await invoiceService.deleteInvoice('inv-1', 'actor-1');

    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', { status: 'pending', invoiceId: null });
    expect(invoiceRepo.deleteById).toHaveBeenCalledWith('inv-1');
  });

  it('deletes even an already-void invoice with no linked plan line', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue({ ...mockInvoice, status: 'void' });
    vi.mocked(invoicePlanRepo.findByInvoiceId).mockResolvedValue(null);

    await invoiceService.deleteInvoice('inv-1', 'actor-1');

    expect(invoicePlanRepo.update).not.toHaveBeenCalled();
    expect(invoiceRepo.deleteById).toHaveBeenCalledWith('inv-1');
  });

  it('throws NOT_FOUND for an unknown invoice', async () => {
    vi.mocked(invoiceRepo.findById).mockResolvedValue(null);

    await expect(invoiceService.deleteInvoice('missing', 'actor-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
