import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AxiosError } from 'axios';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { hasAnyRole, ORDER_TRACKING_FULL_WRITE_ROLES, INVOICE_MANAGE_ROLES } from '../../lib/roles';
import { formatCurrency, formatDate } from '../../lib/format';
import { ORDER_TYPE_OPTIONS, orderTypeLabel } from '../../lib/orderType';
import { invoicePlanStatusLabel, invoiceStatusLabel } from '../../lib/invoicePlanStatus';
import { isValidRocMonthStr, rocMonthStrToAdMonth } from '../../lib/rocDate';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

interface OrderTrackingDetail {
  id: string;
  orderNumber: string;
  orderType: string;
  orderDate: string | null;
  customerShortName: string | null;
  endUser: string | null;
  projectName: string | null;
  salesRepCode: string | null;
  salesRepName: string | null;
  orderAmountUntaxed: string | null;
  estimatedCostUntaxed: string | null;
  remainingUninvoicedAmount: string | null;
  snapshotAt: string | null;
  notes: string | null;
}

interface InvoicePlanRow {
  id: string;
  plannedMonth: string;
  plannedMonthStr: string;
  estimatedCompletionDate: string;
  estimatedCompletionMonthStr: string;
  plannedAmount: string;
  status: string;
  notes: string | null;
}

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
}

interface PlanFormState {
  plannedMonth: string; // ROC year-month, e.g. "115-07"
  estimatedCompletionDate: string; // ROC year-month, e.g. "115-08"
  plannedAmount: string;
  notes: string;
}

interface IssueInvoiceFormState {
  invoiceNumber: string;
  invoiceDate: string; // "YYYY-MM-DD"
  notes: string;
}

const emptyPlanForm: PlanFormState = { plannedMonth: '', estimatedCompletionDate: '', plannedAmount: '', notes: '' };

function monthToDate(month: string): string {
  return `${month}-01`;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const issueInvoiceErrorMessages: Record<string, string> = {
  INVOICE_NUMBER_TAKEN: '這個發票編號已經被使用過，請換一個。',
  INVOICE_PLAN_NOT_PENDING: '這筆計畫明細已經不是未開立狀態了，請重新整理頁面。',
};

export default function OrderTrackingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManageOrderTracking = hasAnyRole(user?.roles, ORDER_TRACKING_FULL_WRITE_ROLES);
  const canManageInvoices = hasAnyRole(user?.roles, INVOICE_MANAGE_ROLES);
  const isSalesRepOnly = (user?.roles ?? []).includes('sales_rep') && !canManageOrderTracking;

  const [orderTracking, setOrderTracking] = useState<OrderTrackingDetail | null>(null);
  const [plans, setPlans] = useState<InvoicePlanRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [notesDraft, setNotesDraft] = useState('');
  const [orderTypeDraft, setOrderTypeDraft] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyPlanForm);
  const [planSaving, setPlanSaving] = useState(false);
  const [deletePlanTarget, setDeletePlanTarget] = useState<InvoicePlanRow | null>(null);
  const [repNotesDraft, setRepNotesDraft] = useState<Record<string, string>>({});
  const [repCompletionDraft, setRepCompletionDraft] = useState<Record<string, string>>({});

  const [issuePlanId, setIssuePlanId] = useState<string | null>(null);
  const [issueForm, setIssueForm] = useState<IssueInvoiceFormState>({ invoiceNumber: '', invoiceDate: todayIsoDate(), notes: '' });
  const [issueSaving, setIssueSaving] = useState(false);

  async function load() {
    if (!id) return;
    try {
      const [otRes, plansRes, invoicesRes] = await Promise.all([
        api.get<{ data: OrderTrackingDetail }>(`/order-trackings/${id}`),
        api.get<{ data: InvoicePlanRow[] }>('/invoice-plans', { params: { orderTrackingId: id, limit: 100 } }),
        api.get<{ data: InvoiceRow[] }>('/invoices', { params: { orderTrackingId: id, limit: 100 } }),
      ]);
      setOrderTracking(otRes.data.data);
      setPlans(plansRes.data.data);
      setInvoices(invoicesRes.data.data);
      setNotesDraft(otRes.data.data.notes ?? '');
      setOrderTypeDraft(otRes.data.data.orderType);
      setRepNotesDraft(Object.fromEntries(plansRes.data.data.map((p) => [p.id, p.notes ?? ''])));
      setRepCompletionDraft(Object.fromEntries(plansRes.data.data.map((p) => [p.id, p.estimatedCompletionMonthStr])));
    } catch {
      setError('讀取失敗，或您沒有權限查看這筆資料。');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDetails() {
    setSavingDetails(true);
    try {
      await api.patch(`/order-trackings/${id}`, { orderType: orderTypeDraft, notes: notesDraft });
      toast.success('已儲存。');
      load();
    } catch {
      toast.error('儲存失敗。');
    } finally {
      setSavingDetails(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      await api.post(`/order-trackings/${id}/sync`);
      toast.success('已重新同步 ERP 快照。');
      load();
    } catch {
      toast.error('同步失敗。');
    } finally {
      setSyncing(false);
    }
  }

  function openNewPlanDialog() {
    setEditingPlanId(null);
    setPlanForm(emptyPlanForm);
    setPlanDialogOpen(true);
  }

  function openEditPlanDialog(plan: InvoicePlanRow) {
    setEditingPlanId(plan.id);
    setPlanForm({
      plannedMonth: plan.plannedMonthStr,
      estimatedCompletionDate: plan.estimatedCompletionMonthStr,
      plannedAmount: plan.plannedAmount,
      notes: plan.notes ?? '',
    });
    setPlanDialogOpen(true);
  }

  async function savePlan() {
    setPlanSaving(true);
    try {
      if (editingPlanId) {
        await api.patch(`/invoice-plans/${editingPlanId}`, {
          plannedMonth: monthToDate(rocMonthStrToAdMonth(planForm.plannedMonth)),
          estimatedCompletionDate: monthToDate(rocMonthStrToAdMonth(planForm.estimatedCompletionDate)),
          plannedAmount: planForm.plannedAmount,
          notes: planForm.notes || undefined,
        });
        toast.success('計畫明細已更新。');
      } else {
        await api.post(`/order-trackings/${id}/invoice-plans`, {
          plannedMonth: monthToDate(rocMonthStrToAdMonth(planForm.plannedMonth)),
          estimatedCompletionDate: monthToDate(rocMonthStrToAdMonth(planForm.estimatedCompletionDate)),
          plannedAmount: planForm.plannedAmount,
          notes: planForm.notes || undefined,
        });
        toast.success('計畫明細已新增。');
      }
      setPlanDialogOpen(false);
      load();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      toast.error(axiosErr.response?.data?.error?.message ?? '儲存失敗。');
    } finally {
      setPlanSaving(false);
    }
  }

  async function deletePlan() {
    if (!deletePlanTarget) return;
    try {
      await api.delete(`/invoice-plans/${deletePlanTarget.id}`);
      toast.success('已刪除。');
      load();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      toast.error(axiosErr.response?.data?.error?.message ?? '刪除失敗。');
    } finally {
      setDeletePlanTarget(null);
    }
  }

  async function saveRepNotes(planId: string) {
    try {
      await api.patch(`/invoice-plans/${planId}`, { notes: repNotesDraft[planId] ?? '' });
      toast.success('備註已更新。');
      load();
    } catch {
      toast.error('更新失敗。');
    }
  }

  async function saveRepCompletion(planId: string) {
    const roc = repCompletionDraft[planId] ?? '';
    if (!isValidRocMonthStr(roc)) {
      toast.error('請輸入正確的民國年月格式，例如 115-09。');
      return;
    }
    try {
      await api.patch(`/invoice-plans/${planId}`, { estimatedCompletionDate: monthToDate(rocMonthStrToAdMonth(roc)) });
      toast.success('預估完成月份已更新。');
      load();
    } catch {
      toast.error('更新失敗。');
    }
  }

  function openIssueDialog(planId: string) {
    setIssuePlanId(planId);
    setIssueForm({ invoiceNumber: '', invoiceDate: todayIsoDate(), notes: '' });
  }

  async function submitIssueInvoice() {
    if (!issuePlanId) return;
    setIssueSaving(true);
    try {
      await api.post('/invoices', {
        invoicePlanId: issuePlanId,
        invoiceNumber: issueForm.invoiceNumber,
        invoiceDate: issueForm.invoiceDate,
        notes: issueForm.notes || undefined,
      });
      toast.success('發票已開立。');
      setIssuePlanId(null);
      load();
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string; message: string } }>;
      const code = axiosErr.response?.data?.error?.code ?? '';
      toast.error(issueInvoiceErrorMessages[code] ?? axiosErr.response?.data?.error?.message ?? '開立失敗。');
    } finally {
      setIssueSaving(false);
    }
  }

  if (error) {
    return (
      <Layout>
        <p className="text-destructive">{error}</p>
      </Layout>
    );
  }

  if (!orderTracking) {
    return (
      <Layout>
        <p className="text-muted-foreground">Loading…</p>
      </Layout>
    );
  }

  const isEditingPending = !editingPlanId || plans.find((p) => p.id === editingPlanId)?.status === 'pending';

  return (
    <Layout>
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="link" className="h-auto p-0" onClick={() => navigate('/order-trackings')}>← 訂單追蹤</Button>
          <h1 className="text-2xl font-semibold">{orderTracking.orderNumber}</h1>
        </div>

        {/* ERP snapshot */}
        <Card>
          <CardHeader>
            <CardTitle>訂單快照（ERP，唯讀）</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-muted-foreground">接單日期</dt><dd>{formatDate(orderTracking.orderDate)}</dd></div>
              <div><dt className="text-muted-foreground">客戶簡稱</dt><dd>{orderTracking.customerShortName ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">END USER</dt><dd>{orderTracking.endUser ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">案名</dt><dd>{orderTracking.projectName ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">業務</dt><dd>{orderTracking.salesRepName ?? '—'} ({orderTracking.salesRepCode ?? '—'})</dd></div>
              <div><dt className="text-muted-foreground">接單金額未稅</dt><dd>{formatCurrency(orderTracking.orderAmountUntaxed)}</dd></div>
              <div><dt className="text-muted-foreground">預估成本未稅</dt><dd>{formatCurrency(orderTracking.estimatedCostUntaxed)}</dd></div>
              <div><dt className="text-muted-foreground">剩餘未開立金額</dt><dd className="font-medium">{formatCurrency(orderTracking.remainingUninvoicedAmount)}</dd></div>
              <div><dt className="text-muted-foreground">快照時間</dt><dd>{orderTracking.snapshotAt ? new Date(orderTracking.snapshotAt).toLocaleString() : '—'}</dd></div>
            </dl>
            {canManageOrderTracking && (
              <Button variant="outline" size="sm" className="mt-4" onClick={sync} disabled={syncing}>
                {syncing ? '同步中…' : '重新從 ERP 同步'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Editable fields */}
        <Card>
          <CardHeader>
            <CardTitle>接單型態 / 備註</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>接單型態</Label>
              {canManageOrderTracking ? (
                <Select value={orderTypeDraft} onValueChange={(v) => setOrderTypeDraft(v as string)}>
                  <SelectTrigger className="w-56">
                    <SelectValue>{(v: string) => orderTypeLabel(v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{orderTypeLabel(orderTracking.orderType)}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              {canManageOrderTracking ? (
                <Textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
              ) : (
                <p className="text-sm text-muted-foreground">{orderTracking.notes || '—'}</p>
              )}
            </div>
            {canManageOrderTracking && (
              <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
                {savingDetails ? '儲存中…' : '儲存'}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* InvoicePlan lines */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>發票開立計畫</CardTitle>
            {canManageOrderTracking && <Button size="sm" onClick={openNewPlanDialog}>+ 新增計畫明細</Button>}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>開立月份 (民國)</TableHead>
                  <TableHead>預估完成月份 (民國)</TableHead>
                  <TableHead>金額未稅</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.plannedMonthStr}</TableCell>
                    <TableCell className="min-w-32">
                      {isSalesRepOnly && p.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="h-8"
                            value={repCompletionDraft[p.id] ?? ''}
                            onChange={(e) => setRepCompletionDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                          />
                          <Button size="xs" variant="outline" onClick={() => saveRepCompletion(p.id)}>存</Button>
                        </div>
                      ) : (
                        p.estimatedCompletionMonthStr
                      )}
                    </TableCell>
                    <TableCell>{formatCurrency(p.plannedAmount)}</TableCell>
                    <TableCell><Badge variant={p.status === 'pending' ? 'secondary' : 'outline'}>{invoicePlanStatusLabel(p.status)}</Badge></TableCell>
                    <TableCell className="min-w-48">
                      {isSalesRepOnly ? (
                        <div className="flex gap-2">
                          <Textarea
                            className="min-h-8"
                            value={repNotesDraft[p.id] ?? ''}
                            onChange={(e) => setRepNotesDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                          />
                          <Button size="xs" variant="outline" onClick={() => saveRepNotes(p.id)}>存</Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{p.notes || '—'}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {canManageOrderTracking && p.status === 'pending' && (
                          <>
                            <Button variant="ghost" size="xs" onClick={() => openEditPlanDialog(p)}>編輯</Button>
                            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeletePlanTarget(p)}>刪除</Button>
                          </>
                        )}
                        {canManageInvoices && p.status === 'pending' && (
                          <Button variant="ghost" size="xs" onClick={() => openIssueDialog(p.id)}>開立發票</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {plans.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無計畫明細。</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Invoices */}
        <Card>
          <CardHeader>
            <CardTitle>已開立發票</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>發票編號</TableHead>
                  <TableHead>開立日期</TableHead>
                  <TableHead>未稅</TableHead>
                  <TableHead>稅額</TableHead>
                  <TableHead>含稅</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link to={`/invoices/${inv.id}`} className="text-primary hover:underline">{inv.invoiceNumber}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(inv.invoiceDate)}</TableCell>
                    <TableCell>{formatCurrency(inv.amount)}</TableCell>
                    <TableCell>{formatCurrency(inv.taxAmount)}</TableCell>
                    <TableCell>{formatCurrency(inv.totalAmount)}</TableCell>
                    <TableCell><Badge variant={inv.status === 'issued' ? 'secondary' : 'destructive'}>{invoiceStatusLabel(inv.status)}</Badge></TableCell>
                  </TableRow>
                ))}
                {invoices.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無發票。</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Plan create/edit dialog */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{editingPlanId ? '編輯計畫明細' : '新增計畫明細'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                開立月份（民國年-月）* <span className="text-muted-foreground text-xs font-normal">例如 115-07</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="115-07"
                value={planForm.plannedMonth}
                disabled={!isEditingPending}
                onChange={(e) => setPlanForm((f) => ({ ...f, plannedMonth: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>
                預估完成月份（民國年-月）* <span className="text-muted-foreground text-xs font-normal">例如 115-08</span>
              </Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="115-08"
                value={planForm.estimatedCompletionDate}
                disabled={!isEditingPending}
                onChange={(e) => setPlanForm((f) => ({ ...f, estimatedCompletionDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>金額未稅 *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={planForm.plannedAmount}
                disabled={!isEditingPending}
                onChange={(e) => setPlanForm((f) => ({ ...f, plannedAmount: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea value={planForm.notes} onChange={(e) => setPlanForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            {!isEditingPending && (
              <p className="text-sm text-muted-foreground">這筆已經開立發票，只能修改備註。</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              onClick={savePlan}
              disabled={
                planSaving ||
                (isEditingPending &&
                  (!isValidRocMonthStr(planForm.plannedMonth) ||
                    !isValidRocMonthStr(planForm.estimatedCompletionDate) ||
                    !planForm.plannedAmount))
              }
            >
              {planSaving ? '儲存中…' : '儲存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete plan confirm dialog */}
      <Dialog open={!!deletePlanTarget} onOpenChange={(open) => { if (!open) setDeletePlanTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>刪除計畫明細</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            確定要刪除 <strong>{deletePlanTarget?.plannedMonthStr}</strong> 這筆計畫明細嗎？
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button variant="destructive" onClick={deletePlan}>刪除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Issue invoice dialog */}
      <Dialog open={!!issuePlanId} onOpenChange={(open) => { if (!open) setIssuePlanId(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>開立發票</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>發票編號 *</Label>
              <Input
                type="text"
                autoComplete="off"
                value={issueForm.invoiceNumber}
                onChange={(e) => setIssueForm((f) => ({ ...f, invoiceNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>開立日期 *</Label>
              <Input
                type="date"
                value={issueForm.invoiceDate}
                onChange={(e) => setIssueForm((f) => ({ ...f, invoiceDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Textarea value={issueForm.notes} onChange={(e) => setIssueForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
            <Button
              onClick={submitIssueInvoice}
              disabled={issueSaving || !issueForm.invoiceNumber || !issueForm.invoiceDate}
            >
              {issueSaving ? '開立中…' : '開立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
