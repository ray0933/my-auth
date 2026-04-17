import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AxiosError } from 'axios';

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

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Change your password</h1>
        <p className="text-gray-600 text-sm mb-6">You must set a new password before continuing.</p>

        {serverError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
            <input id="currentPassword" type="password" {...register('currentPassword')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.currentPassword && <p className="text-red-600 text-xs mt-1">{errors.currentPassword.message}</p>}
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input id="newPassword" type="password" {...register('newPassword')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.newPassword && <p className="text-red-600 text-xs mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input id="confirm" type="password" {...register('confirm')}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {errors.confirm && <p className="text-red-600 text-xs mt-1">{errors.confirm.message}</p>}
          </div>
          <button type="submit" disabled={isSubmitting}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded text-sm font-medium disabled:opacity-60">
            {isSubmitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
