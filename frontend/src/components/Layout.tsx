import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.roles.some((r) => r === 'admin' || r === 'super_admin');

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold text-base">AuthApp</Link>
          <Link to="/profile" className="text-muted-foreground hover:text-foreground text-sm">Profile</Link>
          {isAdmin && (
            <>
              <Link to="/admin/users" className="text-muted-foreground hover:text-foreground text-sm">Users</Link>
              <Link to="/admin/roles" className="text-muted-foreground hover:text-foreground text-sm">Roles</Link>
              <Link to="/admin/permissions" className="text-muted-foreground hover:text-foreground text-sm">Permissions</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground text-sm">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
        </div>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
