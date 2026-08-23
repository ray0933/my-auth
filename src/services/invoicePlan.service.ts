import { InvoicePlan } from '@prisma/client';
import * as invoicePlanRepo from '../repositories/invoicePlan.repository';
import * as orderTrackingRepo from '../repositories/orderTracking.repository';
import { AppError } from '../utils/AppError';
import { toMonthStart, toRocMonthStr } from '../utils/rocDate';
import { hasFullWriteAccess, isScopedToOwnRecords } from '../utils/scopeContext';
import { CallerContext, CreateInvoicePlanDto, InvoicePlanDto, PaginatedResponse, UpdateInvoicePlanDto } from '../types';
import { log } from './audit.service';

function toDto(row: InvoicePlan): InvoicePlanDto {
  return {
    id: row.id,
    orderTrackingId: row.orderTrackingId,
    plannedMonth: row.plannedMonth,
    plannedMonthStr: row.plannedMonthStr,
    estimatedCompletionDate: row.estimatedCompletionDate,
    estimatedCompletionMonthStr: row.estimatedCompletionMonthStr,
    plannedAmount: row.plannedAmount.toString(),
    status: row.status,
    invoiceId: row.invoiceId,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createInvoicePlan(
  orderTrackingId: string,
  dto: CreateInvoicePlanDto,
  actorId: string
): Promise<InvoicePlanDto> {
  const orderTracking = await orderTrackingRepo.findById(orderTrackingId);
  if (!orderTracking) throw new AppError('NOT_FOUND', 404);

  const plannedMonth = toMonthStart(dto.plannedMonth);
  const estimatedCompletionDate = toMonthStart(dto.estimatedCompletionDate);

  const created = await invoicePlanRepo.create({
    orderTrackingId,
    plannedMonth,
    plannedMonthStr: toRocMonthStr(plannedMonth),
    estimatedCompletionDate,
    estimatedCompletionMonthStr: toRocMonthStr(estimatedCompletionDate),
    plannedAmount: dto.plannedAmount,
    notes: dto.notes,
    createdById: actorId,
  });

  await log('invoice_plan_created', {
    userId: actorId,
    metadata: { invoicePlanId: created.id, orderTrackingId },
  });

  return toDto(created);
}

export async function listInvoicePlans(
  page: number,
  limit: number,
  filter: { orderTrackingId?: string; status?: string },
  caller: CallerContext
): Promise<PaginatedResponse<InvoicePlanDto>> {
  const scopedSalesRepCode = isScopedToOwnRecords(caller.roles) ? (caller.employeeCode ?? '__none__') : undefined;
  const { items, total } = await invoicePlanRepo.findAll(page, limit, filter, scopedSalesRepCode);
  const data = items.map(toDto);
  return { success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

const FINANCIAL_FIELDS = ['plannedMonth', 'estimatedCompletionDate', 'plannedAmount'] as const;

export async function updateInvoicePlan(
  id: string,
  dto: UpdateInvoicePlanDto,
  caller: CallerContext,
  actorId: string
): Promise<InvoicePlanDto> {
  const existing = await invoicePlanRepo.findByIdWithOrderTracking(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);

  const submittedFields = Object.keys(dto);
  const touchesFinancialFields = submittedFields.some((f) => (FINANCIAL_FIELDS as readonly string[]).includes(f));

  if (isScopedToOwnRecords(caller.roles)) {
    if (existing.orderTracking.salesRepCode !== caller.employeeCode) throw new AppError('NOT_FOUND', 404);
    if (touchesFinancialFields || submittedFields.some((f) => f !== 'notes')) {
      throw new AppError('FORBIDDEN', 403);
    }
  } else if (hasFullWriteAccess(caller.roles)) {
    if (touchesFinancialFields && existing.status !== 'pending') {
      throw new AppError('INVOICE_PLAN_NOT_PENDING', 409);
    }
  } else {
    // e.g. accounting: read-only on InvoicePlan, no write permission at all.
    throw new AppError('FORBIDDEN', 403);
  }

  const plannedMonth = dto.plannedMonth !== undefined ? toMonthStart(dto.plannedMonth) : undefined;
  const estimatedCompletionDate =
    dto.estimatedCompletionDate !== undefined ? toMonthStart(dto.estimatedCompletionDate) : undefined;

  const updated = await invoicePlanRepo.update(id, {
    ...(plannedMonth ? { plannedMonth, plannedMonthStr: toRocMonthStr(plannedMonth) } : {}),
    ...(estimatedCompletionDate
      ? { estimatedCompletionDate, estimatedCompletionMonthStr: toRocMonthStr(estimatedCompletionDate) }
      : {}),
    ...(dto.plannedAmount !== undefined ? { plannedAmount: dto.plannedAmount } : {}),
    ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
  });

  await log('invoice_plan_updated', {
    userId: actorId,
    metadata: { invoicePlanId: id, fields: submittedFields },
  });

  return toDto(updated);
}

export async function deleteInvoicePlan(id: string, actorId: string): Promise<void> {
  const existing = await invoicePlanRepo.findById(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);
  if (existing.status !== 'pending') throw new AppError('INVOICE_PLAN_NOT_PENDING', 409);

  await invoicePlanRepo.deleteById(id);

  await log('invoice_plan_deleted', {
    userId: actorId,
    metadata: { invoicePlanId: id, orderTrackingId: existing.orderTrackingId },
  });
}
