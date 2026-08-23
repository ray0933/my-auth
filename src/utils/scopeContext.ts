/** Roles that see every OrderTracking/InvoicePlan/Invoice row regardless of
 * salesRepCode — i.e. everyone except sales_rep. */
const UNSCOPED_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];

/** Roles allowed to fully edit OrderTracking/InvoicePlan (any field, subject to the
 * pending-status rule) rather than just read them or edit InvoicePlan.notes. */
const FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];

/** True when row-level scoping by salesRepCode must be applied for this caller —
 * i.e. they have the sales_rep role and none of the "sees everything" roles. */
export function isScopedToOwnRecords(roles: string[]): boolean {
  return roles.includes('sales_rep') && !roles.some((r) => UNSCOPED_ROLES.includes(r));
}

/** True when the caller can fully edit OrderTracking / InvoicePlan (create, edit any
 * field, delete) rather than being read-only or notes-only. */
export function hasFullWriteAccess(roles: string[]): boolean {
  return roles.some((r) => FULL_WRITE_ROLES.includes(r));
}
