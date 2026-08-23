export const ORDER_TYPE_OPTIONS = [
  { value: 'general', label: '一般接單' },
  { value: 'maintenance', label: '維護接單' },
  { value: 'installment', label: '分期接單' },
] as const;

export type OrderType = (typeof ORDER_TYPE_OPTIONS)[number]['value'];

export function orderTypeLabel(value: string): string {
  return ORDER_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
