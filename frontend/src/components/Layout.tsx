import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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
      <nav className="bg-indigo-700 text-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="font-semibold text-lg">AuthApp</Link>
          <Link to="/profile" className="text-indigo-200 hover:text-white text-sm">Profile</Link>
          {isAdmin && (
            <>
              <Link to="/admin/users" className="text-indigo-200 hover:text-white text-sm">Users</Link>
              <Link to="/admin/roles" className="text-indigo-200 hover:text-white text-sm">Roles</Link>
              <Link to="/admin/permissions" className="text-indigo-200 hover:text-white text-sm">Permissions</Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-indigo-200 text-sm">{user?.email}</span>
          <button onClick={handleLogout} className="text-sm bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded">
            Logout
          </button>
        </div>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
