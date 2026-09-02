/**
 * Shared role lists for the Order/Invoice tracking route layer. Extracted so
 * orderTracking.routes.ts, invoicePlan.routes.ts, and invoice.routes.ts don't each
 * redeclare the same arrays under different local names (they used to — READ_ROLES,
 * READ_WRITE_ROLES, and FULL_WRITE_ROLES were three separately-maintained copies of
 * the same two role sets).
 *
 * requireRole() here only decides whether a role can hit the route at all — the finer-
 * grained row/field scoping (sales_rep limited to own records + notes/
 * estimatedCompletionDate; supervisor limited to notes/estimatedCompletionDate on any
 * record) happens in the service layer, see src/utils/scopeContext.ts and
 * invoicePlan.service.ts.
 *
 * Keep the names and values in sync with frontend/src/lib/roles.ts — that copy exists
 * separately (different project, can't share this module directly) and only controls
 * UI show/hide; it is not authoritative. This file is the enforcement side.
 */

// Anyone with any access to OrderTracking / InvoicePlan / Invoice reads.
export const ORDER_TRACKING_READ_ROLES = [
  'sales_rep',
  'accounting',
  'supervisor',
  'accounting_supervisor',
  'admin',
  'super_admin',
];

// Full, unscoped CRUD on OrderTracking and InvoicePlan (create/edit/delete/sync).
export const ORDER_TRACKING_FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];

// Can issue/update/void/delete invoices.
export const INVOICE_MANAGE_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];
