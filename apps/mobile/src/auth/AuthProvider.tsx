import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type AuthResponse, type Me } from '../api/auth';
import { api } from '../api/client';
import { ApiError, NetworkError } from '../api/errors';
import { getGoogleIdToken, googleSignOut } from './google';

export type AuthStatus = 'booting' | 'unreachable' | 'signedOut' | 'unverified' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  /** The account from the last auth response (its email is shown on "Check your email"). */
  account: Me | null;
  signup(input: { email: string; password: string; displayName: string }): Promise<void>;
  login(input: { email: string; password: string }): Promise<void>;
  /** Returns false if the user cancelled the Google picker. */
  loginWithGoogle(): Promise<boolean>;
  logout(): Promise<void>;
  /** Re-checks the session with the server ("I've verified", app start, Retry). */
  recheck(): Promise<AuthStatus>;
  retry(): Promise<void>;
  changeServerUrl(url: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
export const ME_QUERY_KEY = ['me'] as const;

/**
 * Session state machine. The app holds no authoritative data (FR-23): every state is derived from the
 * server's answer to /health and /me.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [account, setAccount] = useState<Me | null>(null);

  const recheck = useCallback(async (): Promise<AuthStatus> => {
    if (!api.hasSession) {
      setStatus('signedOut');
      return 'signedOut';
    }
    try {
      const me = await authApi.me();
      queryClient.setQueryData(ME_QUERY_KEY, me);
      setAccount(me);
      setStatus('signedIn');
      return 'signedIn';
    } catch (error) {
      let next: AuthStatus = 'signedOut';
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') next = 'unverified';
      else if (error instanceof NetworkError) next = 'unreachable';
      else if (error instanceof ApiError && error.status === 401) await api.clearTokens();
      else next = api.hasSession ? 'unreachable' : 'signedOut';
      setStatus(next);
      return next;
    }
  }, [queryClient]);

  // Keeps the current status while it checks: 'booting' (initial state only) unmounts every screen.
  const boot = useCallback(async () => {
    await api.load();
    if (!(await api.ping())) {
      setStatus('unreachable');
      return;
    }
    await recheck();
  }, [recheck]);

  useEffect(() => {
    api.setSessionEndedHandler(() => {
      queryClient.clear();
      setAccount(null);
      setStatus('signedOut');
    });
    void boot();
    return () => api.setSessionEndedHandler(null);
  }, [boot, queryClient]);

  const complete = useCallback(
    async (res: AuthResponse) => {
      await api.setTokens(res);
      setAccount(res.user);
      queryClient.setQueryData(ME_QUERY_KEY, res.user);
      setStatus(res.user.emailVerified ? 'signedIn' : 'unverified');
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    const refreshToken = api.refreshToken;
    if (refreshToken) await authApi.logout(refreshToken).catch(() => undefined);
    await googleSignOut();
    await api.clearTokens();
    queryClient.clear();
    setAccount(null);
    setStatus('signedOut');
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      account,
      signup: async (input) => complete(await authApi.signup(input)),
      login: async (input) => complete(await authApi.login(input)),
      loginWithGoogle: async () => {
        const idToken = await getGoogleIdToken();
        if (!idToken) return false;
        await complete(await authApi.google(idToken));
        return true;
      },
      logout,
      recheck,
      retry: boot,
      changeServerUrl: async (url) => {
        // Changing the server logs the user out (EXPERIENCE.md, Settings: Server URL).
        await logout();
        await api.setServerUrl(url);
        await boot();
      },
    }),
    [status, account, complete, logout, recheck, boot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
