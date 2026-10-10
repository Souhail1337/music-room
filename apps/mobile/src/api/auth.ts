import { api } from './client';

export interface Me {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasGoogle: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export interface AuthResponse {
  user: Me;
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export const authApi = {
  signup: (body: { email: string; password: string; displayName: string }) =>
    api.request<AuthResponse>('/auth/signup', { method: 'POST', body, auth: false }),
  login: (body: { email: string; password: string }) =>
    api.request<AuthResponse>('/auth/login', { method: 'POST', body, auth: false }),
  google: (idToken: string) =>
    api.request<AuthResponse>('/auth/google', { method: 'POST', body: { idToken }, auth: false }),
  logout: (refreshToken: string) =>
    api.request<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  forgot: (email: string) =>
    api.request<{ message: string }>('/auth/forgot', { method: 'POST', body: { email }, auth: false }),
  resendVerification: () => api.request<{ message: string }>('/auth/resend-verification', { method: 'POST' }),
  me: () => api.request<Me>('/me'),
};
