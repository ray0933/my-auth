import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import { hasAnyRole, ORDER_TRACKING_FULL_WRITE_ROLES } from '../../lib/roles';
import { formatCurrency } from '../../lib/format';
import { ORDER_TYPE_OPTIONS, orderTypeLabel } from '../../lib/orderType';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface OrderTrackingRow {
  id: string;
  orderNumber: string;
  orderType: string;
  customerShortName: string | null;
  projectName: string | null;
  salesRepName: string | null;
  orderAmountUntaxed: string | null;
  remainingUninvoicedAmount: string | null;
  createdAt: string;
}

export default function OrderTrackingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = hasAnyRole(user?.roles, ORDER_TRACKING_FULL_WRITE_ROLES);

  const [rows, setRows] = useState<OrderTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderType, setOrderType] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ data: OrderTrackingRow[] }>('/order-trackings', {
        params: {
          limit: 100,
          orderNumber: orderNumber || undefined,
          orderType: orderType || undefined,
        },
      });
      setRows(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">訂單追蹤</h1>
          {canCreate && <Button onClick={() => navigate('/order-trackings/new')}>+ 新增訂單追蹤</Button>}
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <Input
            type="text"
            placeholder="搜尋訂單編號…"
            value={orderNumber}
            onChange={(e) => setOrderNumber((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            className="max-w-xs"
          />
          <Select value={orderType} onValueChange={(value) => setOrderType(value as string)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="接單型態">
                {(v: string) => (v ? orderTypeLabel(v) : '接單型態')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部型態</SelectItem>
              {ORDER_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load}>篩選</Button>
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
                  <TableHead>訂單編號</TableHead>
                  <TableHead>客戶簡稱</TableHead>
                  <TableHead>案名</TableHead>
                  <TableHead>業務</TableHead>
                  <TableHead>接單型態</TableHead>
                  <TableHead>接單金額未稅</TableHead>
                  <TableHead>剩餘未開立</TableHead>
                  <TableHead>建立時間</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/order-trackings/${r.id}`)}>
                    <TableCell>
                      <Button variant="link" className="h-auto p-0">{r.orderNumber}</Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.customerShortName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.projectName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.salesRepName ?? '—'}</TableCell>
                    <TableCell>{orderTypeLabel(r.orderType)}</TableCell>
                    <TableCell>{formatCurrency(r.orderAmountUntaxed)}</TableCell>
                    <TableCell>{formatCurrency(r.remainingUninvoicedAmount)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">尚無訂單追蹤資料。</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
