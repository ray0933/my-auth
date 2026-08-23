/** Formats a Decimal-as-string amount from the API for display. */
export function formatCurrency(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return value;
  return num.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Formats an ISO date string as a plain YYYY-MM-DD date. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('zh-TW');
}
