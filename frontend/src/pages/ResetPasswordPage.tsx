import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { AxiosError } from 'axios';

const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'At least one uppercase letter')
  .regex(/[a-z]/, 'At least one lowercase letter')
  .regex(/[0-9]/, 'At least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?]/, 'At least one special character');

const schema = z.object({
  newPassword: passwordSchema,
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState('');
  const token = searchParams.get('token') ?? '';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setServerError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: data.newPassword });
      navigate('/login?reset=success');
    } catch (err) {
      const axiosErr = err as AxiosError<{ error: { code: string } }>;
      const code = axiosErr.response?.data?.error?.code ?? '';
      if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
        setServerError('This reset link is invalid or has expired. Request a new one.');
      } else {
        setServerError('An unexpected error occurred.');
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Set new password</h1>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              id="newPassword"
              type="password"
              {...register('newPassword')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.newPassword && <p className="text-red-600 text-xs mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              id="confirm"
              type="password"
              {...register('confirm')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {errors.confirm && <p className="text-red-600 text-xs mt-1">{errors.confirm.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded text-sm font-medium disabled:opacity-60"
          >
            {isSubmitting ? 'Saving…' : 'Set password'}
          </button>
        </form>

        <p className="mt-4 text-sm">
          <Link to="/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
