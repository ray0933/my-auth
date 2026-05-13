import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';

interface Permission { id: string; name: string; description: string | null; }

export default function AdminPermissionsPage() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
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
      toast.error('Failed to load permissions.');
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
      toast.success('Permission created.');
    } catch {
      toast.error('Failed to create permission.');
    } finally {
      setCreating(false);
    }
  }

  async function deletePermission() {
    if (!deleteTarget) return;
    await api.delete(`/admin/permissions/${deleteTarget.id}`);
    setDeleteTarget(null);
    load();
    toast.success('Permission deleted.');
  }

  return (
    <Layout>
      <div>
        <h1 className="text-2xl font-semibold mb-6">Permissions</h1>

        {/* Create form */}
        <div className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 mb-6">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-40 space-y-1">
              <Label>Name *</Label>
              <Input
                type="text"
                value={newName}
                onChange={(e) => setNewName((e.target as HTMLInputElement).value)}
                placeholder="e.g. reports:read"
              />
            </div>
            <div className="flex-1 min-w-40 space-y-1">
              <Label>Description</Label>
              <Input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc((e.target as HTMLInputElement).value)}
              />
            </div>
            <Button onClick={createPermission} disabled={creating || !newName.trim()}>
              {creating ? <><Loader2 className="animate-spin" /> Adding…</> : '+ Add'}
            </Button>
          </div>
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description ?? '—'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleteTarget(p)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {permissions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No permissions yet.</TableCell>
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
            <DialogTitle>Delete permission</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Delete permission "<strong>{deleteTarget?.name}</strong>"?</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={deletePermission}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
