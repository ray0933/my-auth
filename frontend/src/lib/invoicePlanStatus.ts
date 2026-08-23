export const INVOICE_PLAN_STATUS_LABELS: Record<string, string> = {
  pending: '未開立',
  invoiced: '已開立',
  cancelled: '已取消',
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: '已開立',
  void: '已作廢',
};

export function invoicePlanStatusLabel(status: string): string {
  return INVOICE_PLAN_STATUS_LABELS[status] ?? status;
}

export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABELS[status] ?? status;
}
