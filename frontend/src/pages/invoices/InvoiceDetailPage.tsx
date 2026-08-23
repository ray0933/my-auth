import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { hasAnyRole, INVOICE_MANAGE_ROLES } from '../../lib/roles';
import { formatCurrency, formatDate } from '../../lib/format';
import { invoiceStatusLabel } from '../../lib/invoicePlanStatus';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  orderTrackingId: string;
  invoiceDate: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = hasAnyRole(user?.roles, INVOICE_MANAGE_ROLES);

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  async function load() {
    try {
      const res = await api.get<{ data: InvoiceDetail }>(`/invoices/${id}`);
      setInvoice(res.data.data);
      setNotesDraft(res.data.data.notes ?? '');
    } catch {
      setError('讀取失敗，或您沒有權限查看這張發票。');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await api.patch(`/invoices/${id}`, { notes: notesDraft });
      toast.success('備註已更新。');
      load();
    } catch {
      toast.error('儲存失敗。');
    } finally {
      setSavingNotes(false);
    }
  }

  async function voidInvoice() {
    setBusy(true);
    try {
      await api.post(`/invoices/${id}/void`, { voidReason });
      toast.success('發票已作廢。');
      setShowVoidDialog(false);
      load();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      toast.error(axiosErr.response?.data?.error?.message ?? '作廢失敗。');
    } finally {
      setBusy(false);
    }
  }

  async function deleteInvoice() {
    setBusy(true);
    try {
      await api.delete(`/invoices/${id}`);
      toast.success('發票已永久刪除。');
      navigate(invoice ? `/order-trackings/${invoice.orderTrackingId}` : '/invoices');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      toast.error(axiosErr.response?.data?.error?.message ?? '刪除失敗。');
      setBusy(false);
    }
  }

  if (error) {
    return (
      <Layout>
        <p className="text-destructive">{error}</p>
      </Layout>
    );
  }

  if (!invoice) {
    return (
      <Layout>
        <p className="text-muted-foreground">Loading…</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="link" className="h-auto p-0" onClick={() => navigate('/invoices')}>← 發票</Button>
          <h1 className="text-2xl font-semibold">{invoice.invoiceNumber}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              發票資訊
              <Badge variant={invoice.status === 'issued' ? 'secondary' : 'destructive'}>{invoiceStatusLabel(invoice.status)}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-muted-foreground">開立日期</dt><dd>{formatDate(invoice.invoiceDate)}</dd></div>
              <div><dt className="text-muted-foreground">未稅金額</dt><dd>{formatCurrency(invoice.amount)}</dd></div>
              <div><dt className="text-muted-foreground">稅額 (5%)</dt><dd>{formatCurrency(invoice.taxAmount)}</dd></div>
              <div><dt className="text-muted-foreground">含稅總額</dt><dd className="font-medium">{formatCurrency(invoice.totalAmount)}</dd></div>
            </dl>
            {invoice.status === 'void' && (
              <div className="text-sm border-t pt-3 mt-3">
                <p className="text-muted-foreground">作廢時間：{invoice.voidedAt ? new Date(invoice.voidedAt).toLocaleString() : '—'}</p>
                <p className="text-muted-foreground">作廢原因：{invoice.voidReason ?? '—'}</p>
              </div>
            )}
            <Link to={`/order-trackings/${invoice.orderTrackingId}`} className="text-primary hover:underline text-sm inline-block">
              查看所屬訂單追蹤 →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>備註</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {canManage ? (
              <>
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                  {savingNotes ? '儲存中…' : '儲存'}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{invoice.notes || '—'}</p>
            )}
          </CardContent>
        </Card>

        {canManage && (
          <Card className="ring-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">危險操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {invoice.status === 'issued' && (
                  <Button variant="outline" size="sm" className="border-yellow-400 text-yellow-700 hover:bg-yellow-50" onClick={() => setShowVoidDialog(true)}>
                    作廢發票
                  </Button>
                )}
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>永久刪除</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Void dialog */}
      <Dialog open={showVoidDialog} onOpenChange={(open) => { if (!open) setShowVoidDialog(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>作廢發票</DialogTitle>
            <DialogDescription>作廢後，對應的計畫明細會打回未開立狀態，可以重新開立。</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>作廢原因 *</Label>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button onClick={voidInvoice} disabled={busy || !voidReason}>作廢</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) setShowDeleteDialog(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>永久刪除發票</DialogTitle>
            <DialogDescription>
              這會把發票記錄整筆從資料庫刪除，<strong>無法復原</strong>（跟作廢不同，作廢還會保留歷史紀錄）。確定要刪除 {invoice.invoiceNumber} 嗎？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button variant="destructive" onClick={deleteInvoice} disabled={busy}>永久刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
