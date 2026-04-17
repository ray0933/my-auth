import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import ConfirmModal from '../../components/ConfirmModal';
import { api } from '../../lib/api';

interface UserDetail {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
  roles: Array<{ role: { id: string; name: string } }>;
}

interface Role { id: string; name: string; }

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [addRoleId, setAddRoleId] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ data: UserDetail }>(`/admin/users/${id}`),
      api.get<{ data: Role[] }>('/admin/roles'),
    ]).then(([userRes, rolesRes]) => {
      setUser(userRes.data.data);
      setDisplayName(userRes.data.data.displayName ?? '');
      setIsActive(userRes.data.data.isActive);
      setAllRoles(rolesRes.data.data);
    }).catch(() => setError('Failed to load user.'));
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/admin/users/${id}`, { displayName, isActive });
      setMsg('Saved.');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function addRole() {
    if (!addRoleId || !user) return;
    await api.post(`/admin/users/${id}/roles`, { roleId: addRoleId });
    const role = allRoles.find((r) => r.id === addRoleId)!;
    setUser((u) => u ? { ...u, roles: [...u.roles, { role }] } : u);
    setAddRoleId('');
  }

  async function removeRole(roleId: string) {
    await api.delete(`/admin/users/${id}/roles/${roleId}`);
    setUser((u) => u ? { ...u, roles: u.roles.filter((r) => r.role.id !== roleId) } : u);
  }

  async function deleteUser() {
    await api.delete(`/admin/users/${id}`);
    navigate('/admin/users');
  }

  async function forceReset() {
    await api.post(`/admin/users/${id}/force-password-reset`);
    setShowResetModal(false);
    setMsg('Password reset forced.');
    setTimeout(() => setMsg(''), 3000);
  }

  async function unlock() {
    await api.post(`/admin/users/${id}/unlock`);
    setMsg('Account unlocked.');
    setTimeout(() => setMsg(''), 3000);
  }

  if (!user) return <Layout><p className="text-gray-500">{error || 'Loading…'}</p></Layout>;

  const assignedIds = new Set(user.roles.map((r) => r.role.id));
  const availableRoles = allRoles.filter((r) => !assignedIds.has(r.id));

  return (
    <Layout>
      <div className="max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/users')} className="text-sm text-indigo-600 hover:underline">← Users</button>
          <h1 className="text-2xl font-bold text-gray-900">{user.email}</h1>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {msg && <p className="text-green-600 text-sm">{msg}</p>}

        {/* Edit */}
        <section className="bg-white rounded-lg shadow p-6 space-y-4">
          <h2 className="text-lg font-semibold">Details</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
          <button onClick={save} disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </section>

        {/* Roles */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Roles</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {user.roles.map((r) => (
              <span key={r.role.id} className="flex items-center gap-1 bg-indigo-100 text-indigo-800 text-sm px-2 py-1 rounded">
                {r.role.name}
                <button onClick={() => removeRole(r.role.id)} className="text-indigo-500 hover:text-red-600 font-bold ml-1">×</button>
              </span>
            ))}
          </div>
          {availableRoles.length > 0 && (
            <div className="flex gap-2">
              <select value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none flex-1">
                <option value="">Add role…</option>
                {availableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button onClick={addRole} disabled={!addRoleId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-60">Add</button>
            </div>
          )}
        </section>

        {/* Danger Zone */}
        <section className="bg-white rounded-lg shadow p-6 border border-red-200">
          <h2 className="text-lg font-semibold text-red-700 mb-3">Danger zone</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={unlock} className="text-sm border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50">Unlock account</button>
            <button onClick={() => setShowResetModal(true)} className="text-sm border border-yellow-400 text-yellow-700 rounded px-3 py-1.5 hover:bg-yellow-50">Force password reset</button>
            <button onClick={() => setShowDeleteModal(true)} className="text-sm bg-red-600 hover:bg-red-700 text-white rounded px-3 py-1.5">Delete user</button>
          </div>
        </section>
      </div>

      {showDeleteModal && (
        <ConfirmModal title="Delete user" message={`Permanently delete ${user.email}?`} confirmLabel="Delete" dangerous
          onConfirm={deleteUser} onCancel={() => setShowDeleteModal(false)} />
      )}
      {showResetModal && (
        <ConfirmModal title="Force password reset" message={`Force ${user.email} to change their password on next login?`}
          onConfirm={forceReset} onCancel={() => setShowResetModal(false)} />
      )}
    </Layout>
  );
}
