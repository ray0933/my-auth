import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_ROLES, ORDER_TRACKING_READ_ROLES, ORDER_TRACKING_FULL_WRITE_ROLES, hasAnyRole } from '../lib/roles';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col gap-4 p-8">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-6 w-full max-w-md" />
      <Skeleton className="h-6 w-full max-w-sm" />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function PasswordChangeGuard() {
  const { user } = useAuth();
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user } = useAuth();
  if (!hasAnyRole(user?.roles, ADMIN_ROLES)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Gates the OrderTracking/Invoice tracking pages. Each page then further restricts
 * which buttons/fields are shown based on the caller's exact role (sales_rep is
 * read-only + notes-only; accounting is read-only on OrderTracking but can manage
 * Invoice; accounting_supervisor/admin/super_admin have full access) — see lib/roles.ts. */
export function OrderTrackingRoute() {
  const { user } = useAuth();
  if (!hasAnyRole(user?.roles, ORDER_TRACKING_READ_ROLES)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

/** Stricter guard for the create-OrderTracking page — sales_rep/accounting can see
 * the list/detail pages (via OrderTrackingRoute) but not create new records. */
export function OrderTrackingManageRoute() {
  const { user } = useAuth();
  if (!hasAnyRole(user?.roles, ORDER_TRACKING_FULL_WRITE_ROLES)) return <Navigate to="/order-trackings" replace />;
  return <Outlet />;
}
