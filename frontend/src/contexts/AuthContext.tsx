import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, setAccessToken } from '../lib/api';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  mustChangePassword: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshTokenSilently: () => Promise<boolean>;
  setUser: (user: AuthUser | null) => void;
  setToken: (token: string | null) => void;
}

export interface LoginResult {
  requiresPasswordChange: boolean;
  mfaChallenge?: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function setToken(token: string | null) {
    setTokenState(token);
    setAccessToken(token);
  }

  async function refreshTokenSilently(): Promise<boolean> {
    try {
      const res = await api.post<{ data: { accessToken: string; user: AuthUser } }>('/auth/refresh');
      setToken(res.data.data.accessToken);
      setUser(res.data.data.user);
      return true;
    } catch {
      setToken(null);
      setUser(null);
      return false;
    }
  }

  useEffect(() => {
    refreshTokenSilently().finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<LoginResult> {
    const res = await api.post<{
      data: { accessToken: string; requiresPasswordChange: boolean; user: AuthUser };
    }>('/auth/login', { email, password });
    const { accessToken: token, requiresPasswordChange, user: loggedInUser } = res.data.data;
    setToken(token);
    setUser(loggedInUser);
    return { requiresPasswordChange };
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // best-effort
    }
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, logout, refreshTokenSilently, setUser, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
