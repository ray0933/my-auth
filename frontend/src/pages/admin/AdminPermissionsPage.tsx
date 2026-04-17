import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ConfirmModal from '../../components/ConfirmModal';
import { api } from '../../lib/api';

interface Permission { id: string; name: string; description: string | null; }

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Permission | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ data: Permission[] }>('/admin/permissions');
      setPermissions(res.data.data);
    } catch {
      setError('Failed to load permissions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createPermission() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/admin/permissions', { name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName('');
      setNewDesc('');
      load();
    } catch {
      setError('Failed to create permission.');
    } finally {
      setCreating(false);
    }
  }

  async function deletePermission() {
    if (!deleteTarget) return;
    await api.delete(`/admin/permissions/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
  }

  return (
    <Layout>
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Permissions</h1>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        {/* Create */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. reports:read"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={createPermission} disabled={creating || !newName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60 whitespace-nowrap">
            {creating ? 'Adding…' : '+ Add'}
          </button>
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
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {permissions.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-sm">{p.name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDeleteTarget(p)} className="text-xs text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {permissions.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No permissions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal title="Delete permission" message={`Delete permission "${deleteTarget.name}"?`} confirmLabel="Delete" dangerous
          onConfirm={deletePermission} onCancel={() => setDeleteTarget(null)} />
      )}
    </Layout>
  );
}
