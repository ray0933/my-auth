import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { AxiosError } from 'axios';


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
  const [saveMsg, setSaveMsg] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');
  const [showMfaDisableModal, setShowMfaDisableModal] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [mfaError, setMfaError] = useState('');

  const { register: regName, handleSubmit: handleName, formState: { isSubmitting: savingName } } =
    useForm<DisplayNameForm>({
      resolver: zodResolver(displayNameSchema),
      defaultValues: { displayName: user?.displayName ?? '' },
    });

  const { register: regPass, handleSubmit: handlePass, reset: resetPass, formState: { errors: passErrors, isSubmitting: savingPass } } =
    useForm<ChangePassForm>({ resolver: zodResolver(changePassSchema) });

  const hasMfa = !!(user as any)?.mfaEnabled;

  async function onSaveName(data: DisplayNameForm) {
    const res = await api.patch<{ data: { displayName: string } }>('/users/me', { displayName: data.displayName });
    if (user) setUser({ ...user, displayName: res.data.data.displayName });
    setSaveMsg('Display name saved.');
    setTimeout(() => setSaveMsg(''), 3000);
  }

  async function onChangePassword(data: ChangePassForm) {
    setPassError('');
    try {
      const res = await api.post<{ data: { accessToken: string } }>('/users/me/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setToken(res.data.data.accessToken);
      resetPass();
      setPassMsg('Password updated.');
      setTimeout(() => setPassMsg(''), 3000);
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
    } catch {
      setMfaError('Invalid code.');
    }
  }

  return (
    <Layout>
      <div className="max-w-xl space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

        {/* Display Name */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Account details</h2>
          <p className="text-sm text-gray-600 mb-4"><span className="font-medium">Email:</span> {user?.email}</p>
          <p className="text-sm text-gray-600 mb-4">
            <span className="font-medium">Roles:</span>{' '}
            {user?.roles.map((r) => (
              <span key={r} className="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded mr-1">{r}</span>
            ))}
          </p>
          <form onSubmit={handleName(onSaveName)} className="flex gap-2 items-end">
            <div className="flex-1">
              <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">Display name</label>
              <input id="displayName" type="text" {...regName('displayName')}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" disabled={savingName}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60">
              Save
            </button>
          </form>
          {saveMsg && <p className="text-green-600 text-sm mt-2">{saveMsg}</p>}
        </section>

        {/* MFA */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Two-factor authentication</h2>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium px-2 py-1 rounded ${hasMfa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
              {hasMfa ? 'Enabled' : 'Disabled'}
            </span>
            {hasMfa ? (
              <button onClick={() => setShowMfaDisableModal(true)}
                className="text-sm text-red-600 hover:underline">Disable MFA</button>
            ) : (
              <button onClick={() => navigate('/mfa/setup')}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded">
                Enable MFA
              </button>
            )}
          </div>
        </section>

        {/* Change Password */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Change password</h2>
          {passError && <p className="text-red-600 text-sm mb-3">{passError}</p>}
          <form onSubmit={handlePass(onChangePassword)} className="space-y-3">
            {(['currentPassword', 'newPassword', 'confirm'] as const).map((field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {field === 'currentPassword' ? 'Current password' : field === 'newPassword' ? 'New password' : 'Confirm new password'}
                </label>
                <input type="password" {...regPass(field)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {passErrors[field] && <p className="text-red-600 text-xs mt-1">{passErrors[field]?.message}</p>}
              </div>
            ))}
            <button type="submit" disabled={savingPass}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded text-sm disabled:opacity-60">
              {savingPass ? 'Saving…' : 'Update password'}
            </button>
            {passMsg && <p className="text-green-600 text-sm">{passMsg}</p>}
          </form>
        </section>
      </div>

      {showMfaDisableModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Disable MFA</h3>
            <p className="text-sm text-gray-600 mb-3">Enter your current authenticator code to confirm.</p>
            <input type="text" inputMode="numeric" maxLength={6} value={mfaDisableCode}
              onChange={(e) => setMfaDisableCode(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-center tracking-widest mb-2" />
            {mfaError && <p className="text-red-600 text-sm mb-2">{mfaError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowMfaDisableModal(false); setMfaDisableCode(''); }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 text-sm">Cancel</button>
              <button onClick={disableMfa} disabled={mfaDisableCode.length !== 6}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-60">Disable</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
