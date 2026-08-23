import * as sequenceRepo from '../repositories/sequence.repository';

/** Generates the next invoice number for the current year, formatted
 * `INV-{year}-{6-digit sequence}`, resetting every year (each year is its own scope). */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const value = await sequenceRepo.incrementAndGet(`INVOICE:${year}`);
  return `INV-${year}-${String(value).padStart(6, '0')}`;
}
