import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome back, {user?.displayName ?? user?.email}.</p>
        <div className="mt-6 p-4 bg-white rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-700"><span className="font-medium">Email:</span> {user?.email}</p>
          <p className="text-sm text-gray-700 mt-1">
            <span className="font-medium">Roles:</span>{' '}
            {user?.roles.map((r) => (
              <span key={r} className="inline-block bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded mr-1">{r}</span>
            ))}
          </p>
        </div>
      </div>
    </Layout>
  );
}
