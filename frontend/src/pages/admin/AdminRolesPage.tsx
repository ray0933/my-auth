import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ConfirmModal from '../../components/ConfirmModal';
import { api } from '../../lib/api';

interface Permission { id: string; name: string; }
interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  rolePermissions: Array<{ permission: Permission }>;
}

export default function AdminRolesPage() {
  const [roles, setRoles] = useState<RoleDetail[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createData, setCreateData] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const [editRole, setEditRole] = useState<RoleDetail | null>(null);
  const [editData, setEditData] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RoleDetail | null>(null);
  const [permTarget, setPermTarget] = useState<RoleDetail | null>(null);
  const [permSelection, setPermSelection] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get<{ data: RoleDetail[] }>('/admin/roles'),
        api.get<{ data: Permission[] }>('/admin/permissions'),
      ]);
      setRoles(rolesRes.data.data);
      setPermissions(permsRes.data.data);
    } catch {
      setError('Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createRole() {
    setCreating(true);
    try {
      await api.post('/admin/roles', createData);
      setShowCreate(false);
      setCreateData({ name: '', description: '' });
      load();
    } catch {
      setError('Failed to create role.');
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    if (!editRole) return;
    setSaving(true);
    try {
      await api.patch(`/admin/roles/${editRole.id}`, editData);
      setEditRole(null);
      load();
    } catch {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!deleteTarget) return;
    await api.delete(`/admin/roles/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  }

  function openPermModal(role: RoleDetail) {
    setPermTarget(role);
    setPermSelection(new Set(role.rolePermissions.map((rp) => rp.permission.id)));
  }

  async function savePerms() {
    if (!permTarget) return;
    const current = new Set(permTarget.rolePermissions.map((rp) => rp.permission.id));
    const toAdd = [...permSelection].filter((id) => !current.has(id));
    const toRemove = [...current].filter((id) => !permSelection.has(id));
    await Promise.all([
      ...toAdd.map((permId) => api.post(`/admin/roles/${permTarget.id}/permissions`, { permissionId: permId })),
      ...toRemove.map((permId) => api.delete(`/admin/roles/${permTarget.id}/permissions/${permId}`)),
    ]);
    setPermTarget(null);
    load();
  }

  function togglePerm(id: string) {
    setPermSelection((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm font-medium">
            + Create Role
          </button>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Permissions</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {roles.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-gray-600">{r.description ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r.rolePermissions.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <button onClick={() => { setEditRole(r); setEditData({ name: r.name, description: r.description ?? '' }); }}
                          className="text-xs text-indigo-600 hover:underline">Edit</button>
                        <button onClick={() => openPermModal(r)} className="text-xs text-green-600 hover:underline">Permissions</button>
                        <button onClick={() => setDeleteTarget(r)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Create role</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" value={createData.name} onChange={(e) => setCreateData((d) => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={createData.description} onChange={(e) => setCreateData((d) => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={createRole} disabled={creating || !createData.name}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-60">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editRole && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Edit role</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" value={editData.name} onChange={(e) => setEditData((d) => ({ ...d, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input type="text" value={editData.description} onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setEditRole(null)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm disabled:opacity-60">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {permTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Permissions for "{permTarget.name}"</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {permissions.map((p) => (
                <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={permSelection.has(p.id)} onChange={() => togglePerm(p.id)} className="rounded" />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPermTarget(null)} className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={savePerms} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete role" message={`Delete role "${deleteTarget.name}"?`} confirmLabel="Delete" dangerous
          onConfirm={deleteRole} onCancel={() => setDeleteTarget(null)} />
      )}
    </Layout>
  );
}
