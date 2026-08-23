import { Invoice, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface InvoiceListFilter {
  orderTrackingId?: string;
  status?: string;
}

export async function findById(id: string): Promise<Invoice | null> {
  return prisma.invoice.findUnique({ where: { id } });
}

export async function findByInvoiceNumber(invoiceNumber: string): Promise<Invoice | null> {
  return prisma.invoice.findUnique({ where: { invoiceNumber } });
}

/** Same row, joined with its OrderTracking — used to check a sales_rep caller's
 * row-level scope (salesRepCode) without a second round trip. */
export async function findByIdWithOrderTracking(id: string) {
  return prisma.invoice.findUnique({
    where: { id },
    include: { orderTracking: true },
  });
}

export async function create(data: Prisma.InvoiceUncheckedCreateInput): Promise<Invoice> {
  return prisma.invoice.create({ data });
}

export async function update(id: string, data: Prisma.InvoiceUncheckedUpdateInput): Promise<Invoice> {
  return prisma.invoice.update({ where: { id }, data });
}

export async function deleteById(id: string): Promise<void> {
  await prisma.invoice.delete({ where: { id } });
}

/**
 * `scopedSalesRepCode`, when set (sales_rep callers), always wins over
 * `filter`'s implicit scope so a caller can't widen it via query params.
 *
 * Joins OrderTracking in (orderNumber/customerShortName etc.) so the list page can
 * display them without an extra round trip per row.
 */
export async function findAll(
  page: number,
  limit: number,
  filter: InvoiceListFilter,
  scopedSalesRepCode?: string
): Promise<{ items: (Invoice & { orderTracking: { orderNumber: string; customerShortName: string | null } })[]; total: number }> {
  const where: Prisma.InvoiceWhereInput = {
    ...(filter.orderTrackingId ? { orderTrackingId: filter.orderTrackingId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(scopedSalesRepCode !== undefined ? { orderTracking: { salesRepCode: scopedSalesRepCode } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { invoiceDate: 'desc' },
      include: { orderTracking: { select: { orderNumber: true, customerShortName: true } } },
    }),
    prisma.invoice.count({ where }),
  ]);
  return { items, total };
}
