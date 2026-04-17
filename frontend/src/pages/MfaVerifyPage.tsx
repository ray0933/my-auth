import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Two-factor authentication</h1>
        <p className="text-gray-600 text-sm mb-6">Enter the 6-digit code from your authenticator app.</p>

        {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          disabled={submitting}
          className="w-full border border-gray-300 rounded px-3 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
          autoComplete="one-time-code"
          autoFocus
        />
        {submitting && <p className="text-center text-gray-500 text-sm mt-3">Verifying…</p>}
      </div>
    </div>
  );
}
