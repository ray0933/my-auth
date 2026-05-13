import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default function MfaVerifyPage() {
  const navigate = useNavigate();
  const { setToken, setUser, user } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleChange(val: string) {
    const digits = val.replace(/\D/g, '');
    setCode(digits);
    if (digits.length === 6) {
      await submit(digits);
    }
  }

  async function submit(token: string) {
    setError('');
    setSubmitting(true);
    try {
      const res = await api.post<{ data: { accessToken: string } }>('/auth/mfa/verify', { token });
      setToken(res.data.data.accessToken);
      if (user) setUser({ ...user, mustChangePassword: false });
      navigate('/dashboard');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      setError(axiosErr.response?.data?.error?.message ?? 'Invalid code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Two-factor authentication</CardTitle>
          <CardDescription>Enter the 6-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => handleChange((e.target as HTMLInputElement).value)}
            disabled={submitting}
            className="text-center text-2xl tracking-widest py-3 h-auto"
            autoComplete="one-time-code"
            autoFocus
          />
          {submitting && <p className="text-center text-muted-foreground text-sm">Verifying…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
