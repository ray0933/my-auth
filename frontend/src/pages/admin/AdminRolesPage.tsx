import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';

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
      toast.error('Failed to load.');
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
      toast.success('Role created.');
    } catch {
      toast.error('Failed to create role.');
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
      toast.success('Role saved.');
    } catch {
      toast.error('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!deleteTarget) return;
    await api.delete(`/admin/roles/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
    toast.success('Role deleted.');
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
    toast.success('Permissions saved.');
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
          <h1 className="text-2xl font-semibold">Roles</h1>
          <Button onClick={() => setShowCreate(true)}>+ Create Role</Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.rolePermissions.length}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="xs" onClick={() => { setEditRole(r); setEditData({ name: r.name, description: r.description ?? '' }); }}>Edit</Button>
                        <Button variant="ghost" size="xs" onClick={() => openPermModal(r)}>Permissions</Button>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create Role dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Create role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input
                type="text"
                value={createData.name}
                onChange={(e) => setCreateData((d) => ({ ...d, name: (e.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                type="text"
                value={createData.description}
                onChange={(e) => setCreateData((d) => ({ ...d, description: (e.target as HTMLInputElement).value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={createRole} disabled={creating || !createData.name}>
              {creating ? <><Loader2 className="animate-spin" /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role dialog */}
      <Dialog open={!!editRole} onOpenChange={(open) => { if (!open) setEditRole(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Edit role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                type="text"
                value={editData.name}
                onChange={(e) => setEditData((d) => ({ ...d, name: (e.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                type="text"
                value={editData.description}
                onChange={(e) => setEditData((d) => ({ ...d, description: (e.target as HTMLInputElement).value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={saveEdit} disabled={saving}>
              {saving ? <><Loader2 className="animate-spin" /> Saving…</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions dialog */}
      <Dialog open={!!permTarget} onOpenChange={(open) => { if (!open) setPermTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Permissions for "{permTarget?.name}"</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {permissions.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={permSelection.has(p.id)}
                  onCheckedChange={() => togglePerm(p.id)}
                />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={savePerms}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete role</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Delete role "<strong>{deleteTarget?.name}</strong>"?</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={deleteRole}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
