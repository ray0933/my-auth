import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const passwordComplexity = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'Uppercase letter required')
  .regex(/[a-z]/, 'Lowercase letter required')
  .regex(/[0-9]/, 'Number required')
  .regex(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/, 'Special character required');

const schema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordComplexity,
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormData = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const { setUser, setToken, user } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      const res = await api.post<{ data: { accessToken: string } }>('/users/me/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setToken(res.data.data.accessToken);
      if (user) setUser({ ...user, mustChangePassword: false });
      navigate('/dashboard');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string; message: string } }>;
      const code = axiosErr.response?.data?.error?.code ?? '';
      if (code === 'INVALID_CREDENTIALS') {
        setServerError('Current password is incorrect.');
      } else {
        setServerError(axiosErr.response?.data?.error?.message ?? 'An unexpected error occurred.');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Change your password</CardTitle>
          <CardDescription>You must set a new password before continuing.</CardDescription>
        </CardHeader>
        <CardContent>
          {serverError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl><Input type="password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Set new password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
