import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { AxiosError } from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

const displayNameSchema = z.object({ displayName: z.string().max(100) });
type DisplayNameForm = z.infer<typeof displayNameSchema>;

const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/)
  .regex(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/);

const changePassSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: passwordSchema,
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });
type ChangePassForm = z.infer<typeof changePassSchema>;

export default function ProfilePage() {
  const { user, setUser, setToken } = useAuth();
  const navigate = useNavigate();
  const [passError, setPassError] = useState('');
  const [showMfaDisableModal, setShowMfaDisableModal] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  const nameForm = useForm<DisplayNameForm>({
    resolver: zodResolver(displayNameSchema),
    defaultValues: { displayName: user?.displayName ?? '' },
  });

  const passForm = useForm<ChangePassForm>({ resolver: zodResolver(changePassSchema) });

  const hasMfa = !!(user as any)?.mfaEnabled;

  async function onSaveName(data: DisplayNameForm) {
    const res = await api.patch<{ data: { displayName: string } }>('/users/me', { displayName: data.displayName });
    if (user) setUser({ ...user, displayName: res.data.data.displayName });
    toast.success('Display name saved.');
  }

  async function onChangePassword(data: ChangePassForm) {
    setPassError('');
    try {
      const res = await api.post<{ data: { accessToken: string } }>('/users/me/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setToken(res.data.data.accessToken);
      passForm.reset();
      toast.success('Password updated.');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string; message: string } }>;
      const code = axiosErr.response?.data?.error?.code ?? '';
      setPassError(code === 'INVALID_CREDENTIALS' ? 'Current password is incorrect.' : 'Failed to update password.');
    }
  }

  async function disableMfa() {
    setMfaError('');
    try {
      await api.post('/auth/mfa/disable', { token: mfaDisableCode });
      setShowMfaDisableModal(false);
      setMfaDisableCode('');
      toast.success('MFA disabled.');
    } catch {
      setMfaError('Invalid code.');
    }
  }

  return (
    <Layout>
      <div className="max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold">Profile</h1>

        {/* Account details */}
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm"><span className="font-medium">Email:</span> {user?.email}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Roles:</span>
              {user?.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
            </div>
            <Form {...nameForm}>
              <form onSubmit={nameForm.handleSubmit(onSaveName)} className="flex gap-2 items-end">
                <FormField
                  control={nameForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>Display name</FormLabel>
                      <FormControl><Input type="text" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={nameForm.formState.isSubmitting}>Save</Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* MFA */}
        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Badge variant={hasMfa ? 'secondary' : 'outline'}>{hasMfa ? 'Enabled' : 'Disabled'}</Badge>
              {hasMfa ? (
                <Button variant="destructive" size="sm" onClick={() => setShowMfaDisableModal(true)}>Disable MFA</Button>
              ) : (
                <Button size="sm" onClick={() => navigate('/mfa/setup')}>Enable MFA</Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            {passError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{passError}</AlertDescription>
              </Alert>
            )}
            <Form {...passForm}>
              <form onSubmit={passForm.handleSubmit(onChangePassword)} className="space-y-3">
                {(['currentPassword', 'newPassword', 'confirm'] as const).map((field) => (
                  <FormField
                    key={field}
                    control={passForm.control}
                    name={field}
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>
                          {field === 'currentPassword' ? 'Current password' : field === 'newPassword' ? 'New password' : 'Confirm new password'}
                        </FormLabel>
                        <FormControl><Input type="password" {...f} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button type="submit" disabled={passForm.formState.isSubmitting}>
                  {passForm.formState.isSubmitting ? 'Saving…' : 'Update password'}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showMfaDisableModal} onOpenChange={(open) => { if (!open) { setShowMfaDisableModal(false); setMfaDisableCode(''); } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Disable MFA</DialogTitle>
            <DialogDescription>Enter your current authenticator code to confirm.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Verification code</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={mfaDisableCode}
              onChange={(e) => setMfaDisableCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))}
              className="text-center tracking-widest"
            />
            {mfaError && <p className="text-destructive text-sm">{mfaError}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={disableMfa} disabled={mfaDisableCode.length !== 6}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
