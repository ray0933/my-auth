import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { toast } from 'sonner';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { ORDER_TYPE_OPTIONS, orderTypeLabel } from '../../lib/orderType';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const schema = z.object({
  orderNumber: z.string().min(1, '請輸入訂單編號'),
  orderType: z.enum(['general', 'maintenance', 'installment'], { error: '請選擇接單型態' }),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const errorMessages: Record<string, string> = {
  ORDER_NOT_FOUND_IN_ERP: '在 ERP 系統中查不到這個訂單編號，請確認輸入是否正確。',
  ORDER_TRACKING_DUPLICATE: '這個訂單編號已經建立過訂單追蹤了。',
};

export default function OrderTrackingFormPage() {
  const navigate = useNavigate();
  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { orderNumber: '', notes: '' } });

  async function onSubmit(data: FormData) {
    try {
      const res = await api.post<{ data: { id: string } }>('/order-trackings', {
        orderNumber: data.orderNumber,
        orderType: data.orderType,
        notes: data.notes || undefined,
      });
      toast.success('訂單追蹤已建立。');
      navigate(`/order-trackings/${res.data.data.id}`);
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string; message: string } }>;
      const code = axiosErr.response?.data?.error?.code ?? '';
      form.setError('orderNumber', { message: errorMessages[code] ?? axiosErr.response?.data?.error?.message ?? '建立失敗。' });
    }
  }

  return (
    <Layout>
      <div className="max-w-lg">
        <Button variant="link" className="h-auto p-0 mb-3" onClick={() => navigate('/order-trackings')}>← 訂單追蹤</Button>
        <Card>
          <CardHeader>
            <CardTitle>新增訂單追蹤</CardTitle>
            <CardDescription>輸入 ERP 訂單編號，系統會自動帶入客戶、業務、金額等快照資訊。</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="orderNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>訂單編號 *</FormLabel>
                      <FormControl>
                        <Input type="text" autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orderType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>接單型態 *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="請選擇接單型態">
                              {(v: string) => (v ? orderTypeLabel(v) : '請選擇接單型態')}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {ORDER_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>備註</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormDescription>本系統自己的追蹤備註，不是 ERP 資料。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {form.formState.errors.root && (
                  <Alert variant="destructive">
                    <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? '建立中…' : '建立'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
