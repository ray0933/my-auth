import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { AxiosError } from 'axios';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Set up two-factor authentication</h1>
        <p className="text-gray-600 text-sm mb-6">Scan the QR code with your authenticator app, then enter the 6-digit code.</p>

        {otpauthUri && (
          <div className="flex justify-center mb-4">
            <QRCodeSVG value={otpauthUri} size={192} />
          </div>
        )}

        {secret && (
          <div className="mb-6 p-3 bg-gray-50 rounded border border-gray-200 text-center">
            <p className="text-xs text-gray-500 mb-1">Manual entry key</p>
            <code className="text-sm font-mono break-all">{secret}</code>
            <button onClick={copySecret} className="block mx-auto mt-2 text-xs text-indigo-600 hover:underline">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <div className="space-y-3">
          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-gray-700 mb-1">Verification code</label>
            <input
              id="totp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoComplete="one-time-code"
              autoFocus
            />
          </div>
          <button
            onClick={handleVerify}
            disabled={submitting || code.length !== 6}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded text-sm font-medium disabled:opacity-60"
          >
            {submitting ? 'Verifying…' : 'Enable MFA'}
          </button>
        </div>
      </div>
    </div>
  );
}
