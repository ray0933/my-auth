import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

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
      toast.success('Changes saved.');
    } catch {
      toast.error('Failed to save.');
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
    toast.success('Password reset forced.');
  }

  async function unlock() {
    await api.post(`/admin/users/${id}/unlock`);
    toast.success('Account unlocked.');
  }

  if (!user) {
    return (
      <Layout>
        <p className="text-muted-foreground">{error || 'Loading…'}</p>
      </Layout>
    );
  }

  const assignedIds = new Set(user.roles.map((r) => r.role.id));
  const availableRoles = allRoles.filter((r) => !assignedIds.has(r.id));

  return (
    <Layout>
      <div className="max-w-xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="link" className="h-auto p-0" onClick={() => navigate('/admin/users')}>← Users</Button>
          <h1 className="text-2xl font-semibold">{user.email}</h1>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active</Label>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {user.roles.map((r) => (
                <Badge key={r.role.id} variant="secondary" className="gap-1">
                  {r.role.name}
                  <button
                    onClick={() => removeRole(r.role.id)}
                    className="ml-1 text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
            {availableRoles.length > 0 && (
              <div className="flex gap-2">
                <Select value={addRoleId} onValueChange={(value) => setAddRoleId(value as string)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Add role…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {availableRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={addRole} disabled={!addRoleId}>Add</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="ring-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" size="sm" onClick={unlock}>Unlock account</Button>
              <Button variant="outline" size="sm" className="border-yellow-400 text-yellow-700 hover:bg-yellow-50" onClick={() => setShowResetModal(true)}>
                Force password reset
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteModal(true)}>Delete user</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteModal} onOpenChange={(open) => { if (!open) setShowDeleteModal(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>Permanently delete {user.email}?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={deleteUser}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force reset confirm dialog */}
      <Dialog open={showResetModal} onOpenChange={(open) => { if (!open) setShowResetModal(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Force password reset</DialogTitle>
            <DialogDescription>Force {user.email} to change their password on next login?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={forceReset}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
