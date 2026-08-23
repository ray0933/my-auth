import { OrderTracking } from '@prisma/client';
import * as orderTrackingRepo from '../repositories/orderTracking.repository';
import * as invoicePlanRepo from '../repositories/invoicePlan.repository';
import * as erpOrderRepo from '../repositories/erpOrder.repository';
import { AppError } from '../utils/AppError';
import { isScopedToOwnRecords } from '../utils/scopeContext';
import {
  CallerContext,
  CreateOrderTrackingDto,
  OrderTrackingDto,
  PaginatedResponse,
  UpdateOrderTrackingDto,
} from '../types';
import { log } from './audit.service';

function decToStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return (value as { toString(): string }).toString();
}

async function toDto(row: OrderTracking): Promise<OrderTrackingDto> {
  const invoicedSum = await invoicePlanRepo.sumInvoicedPlannedAmount(row.id);
  const remainingUninvoicedAmount =
    row.orderAmountUntaxed !== null ? row.orderAmountUntaxed.minus(invoicedSum).toString() : null;

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    orderType: row.orderType,
    orderDate: row.orderDate,
    customerShortName: row.customerShortName,
    endUser: row.endUser,
    projectName: row.projectName,
    salesRepCode: row.salesRepCode,
    salesRepName: row.salesRepName,
    orderAmountUntaxed: decToStr(row.orderAmountUntaxed),
    estimatedCostUntaxed: decToStr(row.estimatedCostUntaxed),
    remainingUninvoicedAmount,
    snapshotAt: row.snapshotAt,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createOrderTracking(dto: CreateOrderTrackingDto, actorId: string): Promise<OrderTrackingDto> {
  const existing = await orderTrackingRepo.findByOrderNumber(dto.orderNumber);
  if (existing) throw new AppError('ORDER_TRACKING_DUPLICATE', 409);

  const snapshot = await erpOrderRepo.findOrderSnapshotByNumber(dto.orderNumber);
  if (!snapshot) throw new AppError('ORDER_NOT_FOUND_IN_ERP', 404);

  const created = await orderTrackingRepo.create({
    orderNumber: dto.orderNumber,
    orderType: dto.orderType,
    notes: dto.notes,
    orderDate: snapshot.orderDate,
    customerShortName: snapshot.customerShortName,
    endUser: snapshot.endUser,
    projectName: snapshot.projectName,
    salesRepCode: snapshot.salesRepCode,
    salesRepName: snapshot.salesRepName,
    orderAmountUntaxed: snapshot.orderAmountUntaxed,
    estimatedCostUntaxed: snapshot.estimatedCostUntaxed,
    snapshotAt: new Date(),
    createdById: actorId,
  });

  await log('order_tracking_created', {
    userId: actorId,
    metadata: { orderTrackingId: created.id, orderNumber: created.orderNumber },
  });

  return toDto(created);
}

export async function listOrderTrackings(
  page: number,
  limit: number,
  filter: { orderType?: string; orderNumber?: string; salesRepCode?: string },
  caller: CallerContext
): Promise<PaginatedResponse<OrderTrackingDto>> {
  const scopedSalesRepCode = isScopedToOwnRecords(caller.roles) ? (caller.employeeCode ?? '__none__') : undefined;
  const { items, total } = await orderTrackingRepo.findAll(page, limit, filter, scopedSalesRepCode);
  const data = await Promise.all(items.map(toDto));
  return { success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getOrderTrackingById(id: string, caller: CallerContext): Promise<OrderTrackingDto> {
  const row = await orderTrackingRepo.findById(id);
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (isScopedToOwnRecords(caller.roles) && row.salesRepCode !== caller.employeeCode) {
    throw new AppError('NOT_FOUND', 404);
  }
  return toDto(row);
}

export async function updateOrderTracking(
  id: string,
  dto: UpdateOrderTrackingDto,
  actorId: string
): Promise<OrderTrackingDto> {
  const existing = await orderTrackingRepo.findById(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);

  const updated = await orderTrackingRepo.update(id, {
    ...(dto.orderType !== undefined ? { orderType: dto.orderType } : {}),
    ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
  });

  await log('order_tracking_updated', {
    userId: actorId,
    metadata: { orderTrackingId: id, fields: Object.keys(dto) },
  });

  return toDto(updated);
}

export async function syncOrderTracking(id: string, actorId: string): Promise<OrderTrackingDto> {
  const existing = await orderTrackingRepo.findById(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);

  const snapshot = await erpOrderRepo.findOrderSnapshotByNumber(existing.orderNumber);
  if (!snapshot) throw new AppError('ORDER_NOT_FOUND_IN_ERP', 404);

  const updated = await orderTrackingRepo.update(id, {
    orderDate: snapshot.orderDate,
    customerShortName: snapshot.customerShortName,
    endUser: snapshot.endUser,
    projectName: snapshot.projectName,
    salesRepCode: snapshot.salesRepCode,
    salesRepName: snapshot.salesRepName,
    orderAmountUntaxed: snapshot.orderAmountUntaxed,
    estimatedCostUntaxed: snapshot.estimatedCostUntaxed,
    snapshotAt: new Date(),
  });

  await log('order_tracking_synced', { userId: actorId, metadata: { orderTrackingId: id } });

  return toDto(updated);
}
