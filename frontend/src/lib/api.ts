import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

let accessToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function onTokenRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as typeof error.config & { _retry?: boolean };
    if (error.response?.status !== 401 || original?._retry || original?.url?.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        subscribeTokenRefresh((token) => {
          if (!token) return reject(error);
          original!.headers!['Authorization'] = `Bearer ${token}`;
          resolve(api(original!));
        });
      });
    }

    original!._retry = true;
    isRefreshing = true;

    try {
      const res = await api.post<{ data: { accessToken: string } }>('/auth/refresh');
      const newToken = res.data.data.accessToken;
      setAccessToken(newToken);
      onTokenRefreshed(newToken);
      original!.headers!['Authorization'] = `Bearer ${newToken}`;
      return api(original!);
    } catch {
      setAccessToken(null);
      onTokenRefreshed(null);
      window.location.href = '/login';
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);
