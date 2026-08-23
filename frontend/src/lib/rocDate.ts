/** ROC (Minguo/民國) year-month helpers for the InvoicePlan month fields, mirroring
 * the backend's src/utils/rocDate.ts (ROC year = AD year - 1911). The UI collects
 * these as plain "YYY-MM" text — there's no native browser input for ROC dates. */

const ROC_MONTH_STR_PATTERN = /^\d{1,3}-(0[1-9]|1[0-2])$/;

export function isValidRocMonthStr(value: string): boolean {
  return ROC_MONTH_STR_PATTERN.test(value.trim());
}

/** "115-07" -> "2026-07" */
export function rocMonthStrToAdMonth(rocMonth: string): string {
  const [rocYearStr, monthStr] = rocMonth.trim().split('-');
  const adYear = Number(rocYearStr) + 1911;
  return `${adYear}-${monthStr!.padStart(2, '0')}`;
}

/** "2026-07" (or "2026-07-01", "2026-07-01T00:00:00.000Z") -> "115-07" */
export function adDateToRocMonthStr(adDate: string): string {
  const [yearStr, monthStr] = adDate.slice(0, 7).split('-');
  const rocYear = Number(yearStr) - 1911;
  return `${rocYear}-${monthStr}`;
}
