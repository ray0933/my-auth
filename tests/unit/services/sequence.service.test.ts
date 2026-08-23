import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/repositories/sequence.repository');

import * as sequenceRepo from '../../../src/repositories/sequence.repository';
import * as sequenceService from '../../../src/services/sequence.service';

beforeEach(() => vi.clearAllMocks());

describe('sequenceService.nextInvoiceNumber', () => {
  it('formats INV-{year}-{6-digit} using a per-year scope', async () => {
    vi.mocked(sequenceRepo.incrementAndGet).mockResolvedValue(7);
    const year = new Date().getFullYear();

    const result = await sequenceService.nextInvoiceNumber();

    expect(sequenceRepo.incrementAndGet).toHaveBeenCalledWith(`INVOICE:${year}`);
    expect(result).toBe(`INV-${year}-000007`);
  });

  it('pads to 6 digits and does not truncate larger values', async () => {
    vi.mocked(sequenceRepo.incrementAndGet).mockResolvedValue(123456);

    const result = await sequenceService.nextInvoiceNumber();

    expect(result).toMatch(/^INV-\d{4}-123456$/);
  });
});
