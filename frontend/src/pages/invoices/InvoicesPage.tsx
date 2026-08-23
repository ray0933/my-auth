import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/format';
import { invoiceStatusLabel } from '../../lib/invoicePlanStatus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  orderTrackingId: string;
  orderNumber: string;
  customerShortName: string | null;
  invoiceDate: string;
  amount: string;
  taxAmount: string;
  totalAmount: string;
  status: string;
}

export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await api.get<{ data: InvoiceRow[] }>('/invoices', {
        params: { limit: 100, status: status || undefined },
      });
      setRows(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">發票</h1>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <Select value={status} onValueChange={(v) => setStatus(v as string)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="全部狀態" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部狀態</SelectItem>
              <SelectItem value="issued">已開立</SelectItem>
              <SelectItem value="void">已作廢</SelectItem>
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
                  <TableHead>發票編號</TableHead>
                  <TableHead>訂單編號</TableHead>
                  <TableHead>客戶簡稱</TableHead>
                  <TableHead>開立日期</TableHead>
                  <TableHead>未稅</TableHead>
                  <TableHead>稅額</TableHead>
                  <TableHead>含稅</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link to={`/invoices/${r.id}`} className="text-primary hover:underline">{r.invoiceNumber}</Link>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        render={<Link to={`/order-trackings/${r.orderTrackingId}`} />}
                      >
                        {r.orderNumber}
                      </Button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.customerShortName ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(r.invoiceDate)}</TableCell>
                    <TableCell>{formatCurrency(r.amount)}</TableCell>
                    <TableCell>{formatCurrency(r.taxAmount)}</TableCell>
                    <TableCell>{formatCurrency(r.totalAmount)}</TableCell>
                    <TableCell><Badge variant={r.status === 'issued' ? 'secondary' : 'destructive'}>{invoiceStatusLabel(r.status)}</Badge></TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">尚無發票。</TableCell>
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
