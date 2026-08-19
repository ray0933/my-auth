import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { AxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

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
  const [createData, setCreateData] = useState({ email: '', displayName: '', roleName: '' });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

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
    try {
      await api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
      toast.success(`User ${u.isActive ? 'deactivated' : 'activated'}.`);
    } catch {
      toast.error('Failed to update user.');
    }
  }

  async function forcePasswordReset(u: UserRow) {
    try {
      await api.post(`/admin/users/${u.id}/force-password-reset`);
      toast.success('Password reset forced.');
    } catch {
      toast.error('Failed.');
    }
  }

  async function unlock(u: UserRow) {
    try {
      await api.post(`/admin/users/${u.id}/unlock`);
      toast.success('Account unlocked.');
    } catch {
      toast.error('Failed.');
    }
  }

  async function deleteUser() {
    if (!deleteTarget) return;
    try {
      await api.delete(`/admin/users/${deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
      toast.success('User deleted.');
    } catch {
      toast.error('Failed to delete user.');
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
        roles: createData.roleName ? [createData.roleName] : [],
      });
      setShowCreate(false);
      setCreateData({ email: '', displayName: '', roleName: '' });
      load();
      toast.success('User created.');
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
          <h1 className="text-2xl font-semibold">Users</h1>
          <Button onClick={() => setShowCreate(true)}>+ Create User</Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <Input
            type="text"
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
            className="max-w-xs"
          />
          <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as string)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All roles</SelectItem>
              {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0" onClick={() => navigate(`/admin/users/${u.id}`)}>
                        {u.email}
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.displayName ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'secondary' : 'destructive'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="ghost" size="xs" onClick={() => toggleActive(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => forcePasswordReset(u)}>Reset pwd</Button>
                        <Button variant="ghost" size="xs" onClick={() => unlock(u)}>Unlock</Button>
                        <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(u)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to permanently delete <strong>{deleteTarget?.email}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={deleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) { setShowCreate(false); setCreateError(''); } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Create user</DialogTitle>
          </DialogHeader>
          {createError && <p className="text-destructive text-sm">{createError}</p>}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input
                type="email"
                value={createData.email}
                onChange={(e) => setCreateData((d) => ({ ...d, email: (e.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                type="text"
                value={createData.displayName}
                onChange={(e) => setCreateData((d) => ({ ...d, displayName: (e.target as HTMLInputElement).value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={createData.roleName} onValueChange={(value) => setCreateData((d) => ({ ...d, roleName: value as string }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No role</SelectItem>
                  {roles.map((r) => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={createUser} disabled={creating || !createData.email}>
              {creating ? <><Loader2 className="animate-spin" /> Creating…</> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
