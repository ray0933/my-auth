import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute, PasswordChangeGuard, AdminRoute } from './components/RouteGuards';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import MfaSetupPage from './pages/MfaSetupPage';
import MfaVerifyPage from './pages/MfaVerifyPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage';
import AdminRolesPage from './pages/admin/AdminRolesPage';
import AdminPermissionsPage from './pages/admin/AdminPermissionsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Authenticated but exempt from password-change guard */}
          <Route element={<ProtectedRoute />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/mfa/verify" element={<MfaVerifyPage />} />

            {/* Authenticated + password already changed */}
            <Route element={<PasswordChangeGuard />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/mfa/setup" element={<MfaSetupPage />} />

              {/* Admin only */}
              <Route element={<AdminRoute />}>
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
                <Route path="/admin/roles" element={<AdminRolesPage />} />
                <Route path="/admin/permissions" element={<AdminPermissionsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
