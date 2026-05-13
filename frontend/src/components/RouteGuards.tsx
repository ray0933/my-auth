import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

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
  const isAdmin = user?.roles.some((r) => r === 'admin' || r === 'super_admin');
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
