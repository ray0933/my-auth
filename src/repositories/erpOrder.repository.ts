import { prisma } from '../config/prisma';
import { OrderSnapshot } from '../types';

/**
 * Read-only access to the external ERP system's order data, via a MSSQL VIEW on the
 * same SQL Server instance (no Prisma-managed table/FK — see prisma/schema.prisma's
 * Order/Invoice tracking section for why). Everything in this system that needs ERP
 * data (OrderTracking creation, and the "sync" action) goes through this one function.
 *
 * The view name/columns below (`vw_ERP_OrderSnapshot`) are a placeholder contract —
 * the real DDL depends on what IT/DBA expose. If it turns out to be several separate
 * views instead of one already-joined view, only the query below needs to change; the
 * OrderSnapshot shape and every caller of this function stays the same.
 */
export async function findOrderSnapshotByNumber(orderNumber: string): Promise<OrderSnapshot | null> {
  const rows = await prisma.$queryRaw<
    {
      orderNumber: string;
      orderDate: Date | null;
      customerShortName: string | null;
      endUser: string | null;
      projectName: string | null;
      salesRepCode: string | null;
      salesRepName: string | null;
      orderAmountUntaxed: string | number | null;
      estimatedCostUntaxed: string | number | null;
    }[]
  >`SELECT
      orderNumber, orderDate, customerShortName, endUser, projectName,
      salesRepCode, salesRepName, orderAmountUntaxed, estimatedCostUntaxed
    FROM dbo.vw_ERP_OrderSnapshot
    WHERE orderNumber = ${orderNumber}`;

  const row = rows[0];
  if (!row) return null;

  return {
    orderNumber: row.orderNumber,
    orderDate: row.orderDate,
    customerShortName: row.customerShortName,
    endUser: row.endUser,
    projectName: row.projectName,
    salesRepCode: row.salesRepCode,
    salesRepName: row.salesRepName,
    orderAmountUntaxed: row.orderAmountUntaxed === null ? null : String(row.orderAmountUntaxed),
    estimatedCostUntaxed: row.estimatedCostUntaxed === null ? null : String(row.estimatedCostUntaxed),
  };
}
