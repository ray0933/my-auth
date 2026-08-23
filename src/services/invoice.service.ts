import { Invoice, Prisma } from '@prisma/client';
import * as invoiceRepo from '../repositories/invoice.repository';
import * as invoicePlanRepo from '../repositories/invoicePlan.repository';
import { AppError } from '../utils/AppError';
import { isScopedToOwnRecords } from '../utils/scopeContext';
import { CallerContext, InvoiceDto, IssueInvoiceDto, PaginatedResponse, VoidInvoiceDto } from '../types';
import { log } from './audit.service';
import { nextInvoiceNumber } from './sequence.service';

const TAX_RATE = 0.05;

function toDto(row: Invoice): InvoiceDto {
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    orderTrackingId: row.orderTrackingId,
    invoiceDate: row.invoiceDate,
    amount: row.amount.toString(),
    taxAmount: row.taxAmount.toString(),
    totalAmount: row.totalAmount.toString(),
    status: row.status,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    issuedById: row.issuedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function issueInvoice(dto: IssueInvoiceDto, actorId: string): Promise<InvoiceDto> {
  const plan = await invoicePlanRepo.findById(dto.invoicePlanId);
  if (!plan) throw new AppError('NOT_FOUND', 404);
  if (plan.status !== 'pending') throw new AppError('INVOICE_PLAN_NOT_PENDING', 409);

  const amount = plan.plannedAmount;
  const taxAmount = amount.times(TAX_RATE).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const totalAmount = amount.plus(taxAmount);
  const invoiceNumber = await nextInvoiceNumber();

  const created = await invoiceRepo.create({
    invoiceNumber,
    orderTrackingId: plan.orderTrackingId,
    amount,
    taxAmount,
    totalAmount,
    issuedById: actorId,
  });

  await invoicePlanRepo.update(plan.id, { status: 'invoiced', invoiceId: created.id });

  await log('invoice_issued', {
    userId: actorId,
    metadata: { invoiceId: created.id, invoiceNumber, invoicePlanId: plan.id, orderTrackingId: plan.orderTrackingId },
  });

  return toDto(created);
}

export async function listInvoices(
  page: number,
  limit: number,
  filter: { orderTrackingId?: string; status?: string },
  caller: CallerContext
): Promise<PaginatedResponse<InvoiceDto>> {
  const scopedSalesRepCode = isScopedToOwnRecords(caller.roles) ? (caller.employeeCode ?? '__none__') : undefined;
  const { items, total } = await invoiceRepo.findAll(page, limit, filter, scopedSalesRepCode);
  const data = items.map(toDto);
  return { success: true, data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export async function getInvoiceById(id: string, caller: CallerContext): Promise<InvoiceDto> {
  const row = await invoiceRepo.findByIdWithOrderTracking(id);
  if (!row) throw new AppError('NOT_FOUND', 404);
  if (isScopedToOwnRecords(caller.roles) && row.orderTracking.salesRepCode !== caller.employeeCode) {
    throw new AppError('NOT_FOUND', 404);
  }
  return toDto(row);
}

export async function voidInvoice(id: string, dto: VoidInvoiceDto, actorId: string): Promise<InvoiceDto> {
  const existing = await invoiceRepo.findById(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);
  if (existing.status === 'void') throw new AppError('INVOICE_ALREADY_VOID', 409);

  const updated = await invoiceRepo.update(id, {
    status: 'void',
    voidedAt: new Date(),
    voidReason: dto.voidReason,
  });

  const plan = await invoicePlanRepo.findByInvoiceId(id);
  if (plan) {
    await invoicePlanRepo.update(plan.id, { status: 'pending', invoiceId: null });
  }

  await log('invoice_voided', {
    userId: actorId,
    metadata: { invoiceId: id, invoiceNumber: existing.invoiceNumber, voidReason: dto.voidReason },
  });

  return toDto(updated);
}

/** Hard delete — removes the Invoice row entirely (distinct from voidInvoice, which
 * keeps a record). Writes the audit snapshot *before* deleting, since afterwards the
 * row (and anything a plain FK join could show) is gone. */
export async function deleteInvoice(id: string, actorId: string): Promise<void> {
  const existing = await invoiceRepo.findById(id);
  if (!existing) throw new AppError('NOT_FOUND', 404);

  await log('invoice_deleted', {
    userId: actorId,
    metadata: {
      invoiceId: id,
      invoiceNumber: existing.invoiceNumber,
      orderTrackingId: existing.orderTrackingId,
      amount: existing.amount.toString(),
      taxAmount: existing.taxAmount.toString(),
      totalAmount: existing.totalAmount.toString(),
      statusAtDeletion: existing.status,
    },
  });

  const plan = await invoicePlanRepo.findByInvoiceId(id);
  if (plan) {
    await invoicePlanRepo.update(plan.id, { status: 'pending', invoiceId: null });
  }

  await invoiceRepo.deleteById(id);
}
