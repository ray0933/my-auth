import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <Layout>
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">Dashboard</h1>
        <p className="text-muted-foreground mb-6">Welcome back, {user?.displayName ?? user?.email}.</p>
        <Card>
          <CardHeader>
            <CardTitle>Account info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm"><span className="font-medium">Email:</span> {user?.email}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">Roles:</span>
              {user?.roles.map((r) => (
                <Badge key={r} variant="secondary">{r}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
