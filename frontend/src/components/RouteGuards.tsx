import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <Spinner />;
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
