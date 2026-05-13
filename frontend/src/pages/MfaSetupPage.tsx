import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { AxiosError } from 'axios';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';

export default function MfaSetupPage() {
  const navigate = useNavigate();
  const [otpauthUri, setOtpauthUri] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.post<{ data: { otpauthUri: string; secret: string } }>('/auth/mfa/setup')
      .then((res) => {
        setOtpauthUri(res.data.data.otpauthUri);
        setSecret(res.data.data.secret);
      })
      .catch(() => setError('Failed to initialise MFA setup.'));
  }, []);

  async function handleVerify() {
    setError('');
    setSubmitting(true);
    try {
      await api.post('/auth/mfa/verify', { token: code });
      navigate('/dashboard');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { message: string } }>;
      setError(axiosErr.response?.data?.error?.message ?? 'Invalid code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function copySecret() {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Set up two-factor authentication</CardTitle>
          <CardDescription>Scan the QR code with your authenticator app, then enter the 6-digit code.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {otpauthUri && (
            <div className="flex justify-center">
              <QRCodeSVG value={otpauthUri} size={192} />
            </div>
          )}

          {secret && (
            <>
              <Separator />
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Manual entry key</p>
                <code className="text-sm font-mono break-all">{secret}</code>
                <Button variant="link" size="sm" className="block mx-auto mt-1 h-auto p-0" onClick={copySecret}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <Separator />
            </>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="totp">Verification code</Label>
            <Input
              id="totp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode((e.target as HTMLInputElement).value.replace(/\D/g, ''))}
              className="text-center tracking-widest"
              autoComplete="one-time-code"
              autoFocus
            />
          </div>
          <Button
            className="w-full"
            onClick={handleVerify}
            disabled={submitting || code.length !== 6}
          >
            {submitting ? 'Verifying…' : 'Enable MFA'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
