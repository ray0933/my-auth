import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config/prisma', () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from '../../../src/config/prisma';
import { findOrderSnapshotByNumber } from '../../../src/repositories/erpOrder.repository';

beforeEach(() => vi.clearAllMocks());

describe('erpOrder.repository.findOrderSnapshotByNumber', () => {
  it('returns null when the ERP view has no matching row', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    const result = await findOrderSnapshotByNumber('ORD-404');

    expect(result).toBeNull();
  });

  it('maps a matching row into an OrderSnapshot, stringifying decimal fields', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        orderNumber: 'ORD-001',
        orderDate: new Date('2026-01-01'),
        customerShortName: 'ACME',
        endUser: 'END',
        projectName: 'Proj',
        salesRepCode: 'S001',
        salesRepName: 'Sales One',
        orderAmountUntaxed: 1000,
        estimatedCostUntaxed: null,
      },
    ]);

    const result = await findOrderSnapshotByNumber('ORD-001');

    expect(result).toEqual({
      orderNumber: 'ORD-001',
      orderDate: new Date('2026-01-01'),
      customerShortName: 'ACME',
      endUser: 'END',
      projectName: 'Proj',
      salesRepCode: 'S001',
      salesRepName: 'Sales One',
      orderAmountUntaxed: '1000',
      estimatedCostUntaxed: null,
    });
  });
});
