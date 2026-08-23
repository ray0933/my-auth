import { InvoicePlan, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface InvoicePlanListFilter {
  orderTrackingId?: string;
  status?: string;
}

export async function findById(id: string): Promise<InvoicePlan | null> {
  return prisma.invoicePlan.findUnique({ where: { id } });
}

/** The plan line an invoice was issued from (if any) — used to revert it back to
 * `pending` when that invoice is voided or hard-deleted. */
export async function findByInvoiceId(invoiceId: string): Promise<InvoicePlan | null> {
  return prisma.invoicePlan.findFirst({ where: { invoiceId } });
}

/** Same row, joined with its OrderTracking — used to check a sales_rep caller's
 * row-level scope (salesRepCode) without a second round trip. */
export async function findByIdWithOrderTracking(id: string) {
  return prisma.invoicePlan.findUnique({
    where: { id },
    include: { orderTracking: true },
  });
}

export async function create(data: Prisma.InvoicePlanUncheckedCreateInput): Promise<InvoicePlan> {
  return prisma.invoicePlan.create({ data });
}

export async function update(id: string, data: Prisma.InvoicePlanUncheckedUpdateInput): Promise<InvoicePlan> {
  return prisma.invoicePlan.update({ where: { id }, data });
}

export async function deleteById(id: string): Promise<void> {
  await prisma.invoicePlan.delete({ where: { id } });
}

/**
 * `scopedSalesRepCode`, when set (sales_rep callers), always wins over
 * `filter`'s implicit scope so a caller can't widen it via query params.
 */
export async function findAll(
  page: number,
  limit: number,
  filter: InvoicePlanListFilter,
  scopedSalesRepCode?: string
): Promise<{ items: InvoicePlan[]; total: number }> {
  const where: Prisma.InvoicePlanWhereInput = {
    ...(filter.orderTrackingId ? { orderTrackingId: filter.orderTrackingId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(scopedSalesRepCode !== undefined ? { orderTracking: { salesRepCode: scopedSalesRepCode } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.invoicePlan.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { plannedMonth: 'asc' } }),
    prisma.invoicePlan.count({ where }),
  ]);
  return { items, total };
}

export async function sumInvoicedPlannedAmount(orderTrackingId: string): Promise<Prisma.Decimal> {
  const result = await prisma.invoicePlan.aggregate({
    where: { orderTrackingId, status: 'invoiced' },
    _sum: { plannedAmount: true },
  });
  return result._sum.plannedAmount ?? new Prisma.Decimal(0);
}
