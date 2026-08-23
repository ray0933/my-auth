/** Normalizes a date to the 1st of its month, at UTC midnight, for storing
 * month-granularity fields like InvoicePlan.plannedMonth. */
export function toMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** Formats a date as an ROC (Republic of China / Minguo) year-month string,
 * e.g. 2026-07 -> "115-07" (ROC year = AD year - 1911). Used for
 * InvoicePlan.plannedMonthStr / estimatedCompletionMonthStr. */
export function toRocMonthStr(date: Date): string {
  const rocYear = date.getUTCFullYear() - 1911;
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${rocYear}-${month}`;
}
