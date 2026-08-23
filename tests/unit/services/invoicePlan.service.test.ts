import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../../src/repositories/invoicePlan.repository');
vi.mock('../../../src/repositories/orderTracking.repository');
vi.mock('../../../src/services/audit.service');

import * as invoicePlanRepo from '../../../src/repositories/invoicePlan.repository';
import * as orderTrackingRepo from '../../../src/repositories/orderTracking.repository';
import * as invoicePlanService from '../../../src/services/invoicePlan.service';

const mockOrderTracking = { id: 'ot-1', salesRepCode: 'S001' } as any;

const mockPlan = {
  id: 'plan-1',
  orderTrackingId: 'ot-1',
  plannedMonth: new Date(Date.UTC(2026, 6, 1)),
  plannedMonthStr: '115-07',
  estimatedCompletionDate: new Date(Date.UTC(2026, 6, 1)),
  estimatedCompletionMonthStr: '115-07',
  plannedAmount: new Prisma.Decimal('1000'),
  status: 'pending',
  invoiceId: null,
  notes: null,
  createdById: 'actor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

beforeEach(() => vi.clearAllMocks());

describe('invoicePlanService.createInvoicePlan', () => {
  it('normalizes dates to month-start and computes ROC month strings', async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(mockOrderTracking);
    vi.mocked(invoicePlanRepo.create).mockResolvedValue(mockPlan);

    await invoicePlanService.createInvoicePlan(
      'ot-1',
      { plannedMonth: new Date('2026-07-15'), estimatedCompletionDate: new Date('2026-08-20'), plannedAmount: 1000 },
      'actor-1'
    );

    const createArg = vi.mocked(invoicePlanRepo.create).mock.calls[0]![0] as any;
    expect(createArg.plannedMonthStr).toBe('115-07');
    expect(createArg.estimatedCompletionMonthStr).toBe('115-08');
    expect(createArg.plannedMonth.getUTCDate()).toBe(1);
  });

  it('throws NOT_FOUND when the OrderTracking does not exist', async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(null);

    await expect(
      invoicePlanService.createInvoicePlan(
        'missing',
        { plannedMonth: new Date(), estimatedCompletionDate: new Date(), plannedAmount: 1 },
        'actor-1'
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('invoicePlanService.updateInvoicePlan', () => {
  it('lets accounting_supervisor edit any field while pending', async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      orderTracking: mockOrderTracking,
    });
    vi.mocked(invoicePlanRepo.update).mockResolvedValue(mockPlan);

    await invoicePlanService.updateInvoicePlan(
      'plan-1',
      { plannedAmount: 2000 },
      { userId: 'u1', roles: ['accounting_supervisor'], employeeCode: null },
      'actor-1'
    );

    expect(invoicePlanRepo.update).toHaveBeenCalled();
  });

  it('rejects financial-field edits once the plan is invoiced (409)', async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      status: 'invoiced',
      orderTracking: mockOrderTracking,
    });

    await expect(
      invoicePlanService.updateInvoicePlan(
        'plan-1',
        { plannedAmount: 2000 },
        { userId: 'u1', roles: ['accounting_supervisor'], employeeCode: null },
        'actor-1'
      )
    ).rejects.toMatchObject({ code: 'INVOICE_PLAN_NOT_PENDING' });
  });

  it('lets a sales_rep edit notes on their own plan line regardless of status', async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      status: 'invoiced',
      orderTracking: mockOrderTracking,
    });
    vi.mocked(invoicePlanRepo.update).mockResolvedValue(mockPlan);

    await invoicePlanService.updateInvoicePlan(
      'plan-1',
      { notes: 'called customer' },
      { userId: 'u2', roles: ['sales_rep'], employeeCode: 'S001' },
      'u2'
    );

    expect(invoicePlanRepo.update).toHaveBeenCalledWith('plan-1', expect.objectContaining({ notes: 'called customer' }));
  });

  it('rejects a sales_rep editing a non-notes field (403)', async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      orderTracking: mockOrderTracking,
    });

    await expect(
      invoicePlanService.updateInvoicePlan(
        'plan-1',
        { plannedAmount: 500 },
        { userId: 'u2', roles: ['sales_rep'], employeeCode: 'S001' },
        'u2'
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("hides a plan outside a sales_rep's scope as 404", async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      orderTracking: mockOrderTracking,
    });

    await expect(
      invoicePlanService.updateInvoicePlan(
        'plan-1',
        { notes: 'x' },
        { userId: 'u2', roles: ['sales_rep'], employeeCode: 'S999' },
        'u2'
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects accounting entirely — it has no invoice_plans:write* permission (403)', async () => {
    vi.mocked(invoicePlanRepo.findByIdWithOrderTracking).mockResolvedValue({
      ...mockPlan,
      orderTracking: mockOrderTracking,
    });

    await expect(
      invoicePlanService.updateInvoicePlan(
        'plan-1',
        { notes: 'x' },
        { userId: 'u3', roles: ['accounting'], employeeCode: null },
        'u3'
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('invoicePlanService.deleteInvoicePlan', () => {
  it('deletes a pending plan line', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue(mockPlan);

    await invoicePlanService.deleteInvoicePlan('plan-1', 'actor-1');

    expect(invoicePlanRepo.deleteById).toHaveBeenCalledWith('plan-1');
  });

  it('rejects deleting an already-invoiced plan line (409)', async () => {
    vi.mocked(invoicePlanRepo.findById).mockResolvedValue({ ...mockPlan, status: 'invoiced' });

    await expect(invoicePlanService.deleteInvoicePlan('plan-1', 'actor-1')).rejects.toMatchObject({
      code: 'INVOICE_PLAN_NOT_PENDING',
    });
  });
});
