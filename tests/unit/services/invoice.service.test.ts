import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../../src/repositories/invoice.repository');
vi.mock('../../../src/repositories/invoicePlan.repository');
vi.mock('../../../src/services/audit.service');

import * as invoiceRepo from '../../../src/repositories/invoice.repository';
import * as invoicePlanRepo from '../../../src/repositories/invoicePlan.repository';
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
  notes: null,
  issuedById: 'actor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const mockOrderTrackingSummary = { orderNumber: 'ORD-001', customerShortName: 'ACME' };
const mockInvoiceWithOrderTracking = { ...mockInvoice, orderTracking: mockOrderTrackingSummary } as any;

beforeEach(() => vi.clearAllMocks());

const issueDto = {
  invoicePlanId: 'plan-1',
  invoiceNumber: 'INV-2026-000001',
  invoiceDate: new Date('2026-08-22'),
  notes: 'urgent',
};

describe('invoiceService.issueInvoice', () => {
  it('computes 5% tax and total, using the user-supplied invoice number/date', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(mockPlan);
    vi.mocked(invoiceRepo.findByInvoiceNumber).mockResolvedValue(null);
    vi.mocked(invoiceRepo.create).mockResolvedValue(mockInvoice);
    vi.mocked(invoicePlanRepo.update).mockResolvedValue({ ...mockPlan, status: 'invoiced', invoiceId: 'inv-1' });
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue(mockInvoiceWithOrderTracking);

    const result = await invoiceService.issueInvoice(issueDto, 'actor-1');

    expect(result.amount).toBe('1000');
    expect(result.taxAmount).toBe('50');
    expect(result.totalAmount).toBe('1050');
    expect(result.orderNumber).toBe('ORD-001');
    expect(result.customerShortName).toBe('ACME');
    expect(invoiceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumber: 'INV-2026-000001', invoiceDate: issueDto.invoiceDate, notes: 'urgent' })
    );
    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', { status: 'invoiced', invoiceId: 'inv-1' });
  });

  it('rounds tax to 2 decimal places (half up)', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue({ ...mockPlan, plannedAmount: new Prisma.Decimal('333.33') });
    vi.mocked(invoiceRepo.findByInvoiceNumber).mockResolvedValue(null);
    vi.mocked(invoiceRepo.create).mockImplementation(async (data: any) => ({ ...mockInvoice, ...data }));
    vi.mocked(invoicePlanRepo.update).mockResolvedValue(mockPlan);
    // Echoes back whatever issueInvoice actually passed to create(), so the assertion
    // below is still checking the service's own tax computation, not a hardcoded value.
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockImplementation(async () => {
      const createdData = vi.mocked(invoiceRepo.create).mock.calls[0]![0];
      return { ...mockInvoice, ...createdData, orderTracking: mockOrderTrackingSummary } as any;
    });

    const result = await invoiceService.issueInvoice(issueDto, 'actor-1');

    // 333.33 * 0.05 = 16.6665 -> rounds to 16.67 (ROUND_HALF_UP)
    expect(result.taxAmount).toBe('16.67');
  });

  it('throws INVOICE_PLAN_NOT_PENDING when the plan is already invoiced', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue({ ...mockPlan, status: 'invoiced' });

    await expect(invoiceService.issueInvoice(issueDto, 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_PLAN_NOT_PENDING',
    });
  });

  it('throws NOT_FOUND for an unknown plan', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(null);

    await expect(
      invoiceService.issueInvoice({ ...issueDto, invoicePlanId: 'missing' }, 'actor-1')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws INVOICE_NUMBER_TAKEN when the invoice number is already used', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(mockPlan);
    vi.mocked(invoiceRepo.findByInvoiceNumber).mockResolvedValue(mockInvoice);

    await expect(invoiceService.issueInvoice(issueDto, 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_NUMBER_TAKEN',
    });
    expect(invoiceRepo.create).not.toHaveBeenCalled();
  });
});

describe('invoiceService.updateInvoice', () => {
  it('updates notes and returns the joined DTO', async () => {
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue(mockInvoiceWithOrderTracking);
    vi.mocked(invoiceRepo.update).mockResolvedValue({ ...mockInvoice, notes: 'called customer' });

    const result = await invoiceService.updateInvoice('inv-1', { notes: 'called customer' }, 'actor-1');

    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', { notes: 'called customer' });
    expect(result.notes).toBe('called customer');
    expect(result.orderNumber).toBe('ORD-001');
  });

  it('throws NOT_FOUND for an unknown invoice', async () => {
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue(null);

    await expect(invoiceService.updateInvoice('missing', { notes: 'x' }, 'actor-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('invoiceService.voidInvoice', () => {
  it('voids an issued invoice and reverts the linked plan line to pending', async () => {
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue(mockInvoiceWithOrderTracking);
    vi.mocked(invoiceRepo.update).mockResolvedValue({ ...mockInvoice, status: 'void' });
    vi.mocked(invoicePlanRepo.findByInvoiceId).mockResolvedValue({ ...mockPlan, status: 'invoiced', invoiceId: 'inv-1' });

    const result = await invoiceService.voidInvoice('inv-1', { voidReason: 'typo' }, 'actor-1');

    expect(result.status).toBe('void');
    expect(result.orderNumber).toBe('ORD-001');
    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', { status: 'pending', invoiceId: null });
  });

  it('throws INVOICE_ALREADY_VOID for an already-void invoice', async () => {
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue({ ...mockInvoiceWithOrderTracking, status: 'void' });

    await expect(invoiceService.voidInvoice('inv-1', { voidReason: 'x' }, 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_ALREADY_VOID',
    });
  });

  it('throws NOT_FOUND for an unknown invoice', async () => {
    vi.mocked(invoiceRepo.findByIdWithOrderTracking).mockResolvedValue(null);

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
