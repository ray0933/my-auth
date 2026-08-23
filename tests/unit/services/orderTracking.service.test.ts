import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../../src/repositories/orderTracking.repository');
vi.mock('../../../src/repositories/invoicePlan.repository');
vi.mock('../../../src/repositories/erpOrder.repository');
vi.mock('../../../src/services/audit.service');

import * as orderTrackingRepo from '../../../src/repositories/orderTracking.repository';
import * as invoicePlanRepo from '../../../src/repositories/invoicePlan.repository';
import * as erpOrderRepo from '../../../src/repositories/erpOrder.repository';
import * as orderTrackingService from '../../../src/services/orderTracking.service';

const mockRow = {
  id: 'ot-1',
  orderNumber: 'ORD-001',
  orderType: 'general',
  orderDate: new Date('2026-01-01'),
  customerShortName: 'ACME',
  endUser: 'END',
  projectName: 'Project X',
  salesRepCode: 'S001',
  salesRepName: 'Sales One',
  orderAmountUntaxed: new Prisma.Decimal('1000'),
  estimatedCostUntaxed: new Prisma.Decimal('500'),
  snapshotAt: new Date('2026-01-01'),
  notes: null,
  createdById: 'actor-1',
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const mockSnapshot = {
  orderNumber: 'ORD-001',
  orderDate: new Date('2026-01-01'),
  customerShortName: 'ACME',
  endUser: 'END',
  projectName: 'Project X',
  salesRepCode: 'S001',
  salesRepName: 'Sales One',
  orderAmountUntaxed: '1000',
  estimatedCostUntaxed: '500',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoicePlanRepo.sumInvoicedPlannedAmount).mockResolvedValue(new Prisma.Decimal(0));
});

describe('orderTrackingService.createOrderTracking', () => {
  it('creates an OrderTracking from an ERP snapshot', async () => {
    vi.mocked(orderTrackingRepo.findByOrderNumber).mockResolvedValue(null);
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue(mockSnapshot);
    vi.mocked(orderTrackingRepo.create).mockResolvedValue(mockRow);

    const result = await orderTrackingService.createOrderTracking(
      { orderNumber: 'ORD-001', orderType: 'general' },
      'actor-1'
    );

    expect(result.orderNumber).toBe('ORD-001');
    expect(result.remainingUninvoicedAmount).toBe('1000');
    expect(orderTrackingRepo.create).toHaveBeenCalled();
  });

  it('throws ORDER_TRACKING_DUPLICATE when the order number is already tracked', async () => {
    vi.mocked(orderTrackingRepo.findByOrderNumber).mockResolvedValue(mockRow);

    await expect(
      orderTrackingService.createOrderTracking({ orderNumber: 'ORD-001', orderType: 'general' }, 'actor-1')
    ).rejects.toMatchObject({ code: 'ORDER_TRACKING_DUPLICATE' });
    expect(erpOrderRepo.findOrderSnapshotByNumber).not.toHaveBeenCalled();
  });

  it('throws ORDER_NOT_FOUND_IN_ERP when the ERP has no matching order', async () => {
    vi.mocked(orderTrackingRepo.findByOrderNumber).mockResolvedValue(null);
    vi.mocked(erpOrderRepo.findOrderSnapshotByNumber).mockResolvedValue(null);

    await expect(
      orderTrackingService.createOrderTracking({ orderNumber: 'ORD-404', orderType: 'general' }, 'actor-1')
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND_IN_ERP' });
  });
});

describe('orderTrackingService.getOrderTrackingById row-level scoping', () => {
  it('lets a sales_rep view their own record', async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(mockRow);

    const dto = await orderTrackingService.getOrderTrackingById('ot-1', {
      userId: 'u1',
      roles: ['sales_rep'],
      employeeCode: 'S001',
    });

    expect(dto.id).toBe('ot-1');
  });

  it("hides another rep's record from a sales_rep as 404 (not 403)", async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(mockRow);

    await expect(
      orderTrackingService.getOrderTrackingById('ot-1', { userId: 'u2', roles: ['sales_rep'], employeeCode: 'S999' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets accounting_supervisor view any record', async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(mockRow);

    const dto = await orderTrackingService.getOrderTrackingById('ot-1', {
      userId: 'u3',
      roles: ['accounting_supervisor'],
      employeeCode: null,
    });

    expect(dto.id).toBe('ot-1');
  });

  it('throws NOT_FOUND for a missing id', async () => {
    vi.mocked(orderTrackingRepo.findById).mockResolvedValue(null);

    await expect(
      orderTrackingService.getOrderTrackingById('missing', { userId: 'u1', roles: ['admin'], employeeCode: null })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
