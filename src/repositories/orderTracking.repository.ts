import { OrderTracking, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface OrderTrackingListFilter {
  orderType?: string;
  orderNumber?: string;
  salesRepCode?: string;
}

export async function findByOrderNumber(orderNumber: string): Promise<OrderTracking | null> {
  return prisma.orderTracking.findUnique({ where: { orderNumber } });
}

export async function findById(id: string): Promise<OrderTracking | null> {
  return prisma.orderTracking.findUnique({ where: { id } });
}

export async function create(data: Prisma.OrderTrackingUncheckedCreateInput): Promise<OrderTracking> {
  return prisma.orderTracking.create({ data });
}

export async function update(id: string, data: Prisma.OrderTrackingUncheckedUpdateInput): Promise<OrderTracking> {
  return prisma.orderTracking.update({ where: { id }, data });
}

/**
 * `scopedSalesRepCode`, when set (sales_rep callers — see utils/scopeContext.ts),
 * always wins over `filter.salesRepCode` so a caller can't widen their own row-level
 * scope by passing a different value in the query string.
 */
export async function findAll(
  page: number,
  limit: number,
  filter: OrderTrackingListFilter,
  scopedSalesRepCode?: string
): Promise<{ items: OrderTracking[]; total: number }> {
  const where: Prisma.OrderTrackingWhereInput = {
    ...(filter.orderType ? { orderType: filter.orderType } : {}),
    ...(filter.orderNumber ? { orderNumber: { contains: filter.orderNumber } } : {}),
    ...(scopedSalesRepCode !== undefined
      ? { salesRepCode: scopedSalesRepCode }
      : filter.salesRepCode
        ? { salesRepCode: filter.salesRepCode }
        : {}),
  };

  const [items, total] = await Promise.all([
    prisma.orderTracking.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.orderTracking.count({ where }),
  ]);
  return { items, total };
}
