import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ConfirmModal from '../../components/ConfirmModal';
import { api } from '../../lib/api';
import { AxiosError } from 'axios';

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  roles: string[];
}

interface Role {
  id: string;
  name: string;
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ email: '', displayName: '', roleId: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        api.get<{ data: UserRow[] }>('/admin/users'),
        api.get<{ data: Role[] }>('/admin/roles'),
      ]);
      setUsers(usersRes.data.data);
      setRoles(rolesRes.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.displayName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || u.roles.some((r) => r === roleFilter);
    const matchActive = activeFilter === 'all' || (activeFilter === 'active' ? u.isActive : !u.isActive);
    return matchSearch && matchRole && matchActive;
  });

  async function toggleActive(u: UserRow) {
    setActionError('');
    try {
      await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
    } catch {
      setActionError('Failed to update user.');
    }
  }

  async function forcePasswordReset(u: UserRow) {
    setActionError('');
    try {
      await api.post(`/admin/users/${u.id}/force-password-reset`);
    } catch {
      setActionError('Failed.');
    }
  }

  async function unlock(u: UserRow) {
    setActionError('');
    try {
      await api.post(`/admin/users/${u.id}/unlock`);
    } catch {
      setActionError('Failed.');
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
    } catch {
      setActionError('Failed to delete user.');
    }
    setDeleteTarget(null);
  }

  async function createUser() {
    setCreateError('');
    setCreating(true);
    try {
      await api.post('/admin/users', {
        email: createData.email,
        displayName: createData.displayName || undefined,
        roles: createData.roleId ? [createData.roleId] : [],
      });
      setShowCreate(false);
      setCreateData({ email: '', displayName: '', roleId: '' });
      load();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string; message: string } }>;
      setCreateError(axiosErr.response?.data?.error?.message ?? 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium">
            + Create User
          </button>
        </div>

        {actionError && <p className="text-red-600 text-sm mb-4">{actionError}</p>}

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <input type="text" placeholder="Search email or name…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 max-w-xs" />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
            <option value="">All roles</option>
            {roles.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Roles</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => navigate(`/admin/users/${u.id}`)} className="text-indigo-600 hover:underline">
                        {u.email}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.displayName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {u.roles.map((r) => (
                        <span key={r} className="inline-block bg-indigo-100 text-indigo-800 text-xs px-1.5 py-0.5 rounded mr-1">
                          {r}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => toggleActive(u)} className="text-xs text-indigo-600 hover:underline">
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => forcePasswordReset(u)} className="text-xs text-yellow-600 hover:underline">Reset pwd</button>
                        <button onClick={() => unlock(u)} className="text-xs text-green-600 hover:underline">Unlock</button>
                        <button onClick={() => setDeleteTarget(u)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete user"
          message={`Are you sure you want to permanently delete ${deleteTarget.email}? This cannot be undone.`}
          confirmLabel="Delete"
          dangerous
          onConfirm={deleteUser}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Create user</h2>
            {createError && <p className="text-red-600 text-sm mb-3">{createError}</p>}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={createData.email} onChange={(e) => setCreateData((d) => ({ ...d, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
                <input type="text" value={createData.displayName} onChange={(e) => setCreateData((d) => ({ ...d, displayName: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select value={createData.roleId} onChange={(e) => setCreateData((d) => ({ ...d, roleId: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none">
                  <option value="">Select role…</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => { setShowCreate(false); setCreateError(''); }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={createUser} disabled={creating || !createData.email}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-60">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
