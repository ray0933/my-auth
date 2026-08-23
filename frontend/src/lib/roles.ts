/** Shared role-check helper — extracted so RouteGuards.tsx, Layout.tsx, and the new
 * OrderTracking/Invoice pages don't each re-implement `roles.some(...)`. */
export function hasAnyRole(userRoles: string[] | undefined, allowed: string[]): boolean {
  if (!userRoles) return false;
  return allowed.some((r) => userRoles.includes(r));
}

export const ADMIN_ROLES = ['admin', 'super_admin'];

// Order/Invoice tracking (Phase 1)
export const ORDER_TRACKING_READ_ROLES = ['sales_rep', 'accounting', 'accounting_supervisor', 'admin', 'super_admin'];
export const ORDER_TRACKING_FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];
export const INVOICE_MANAGE_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];
