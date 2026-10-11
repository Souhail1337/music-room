import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { api } from '../../api/client';
import { installFetch, jsonResponse, secureStore, storeTokens, type SeenRequest } from '../../testing/fakes';
import { AuthProvider, useAuth } from '../AuthProvider';

jest.mock('expo-secure-store', () => require('../../testing/fakes').secureStoreMock);
// Native Google module: not available in Jest. Not what is under test.
jest.mock('../google', () => ({
  getGoogleIdToken: jest.fn(async () => null),
  googleSignOut: jest.fn(async () => undefined),
  GoogleNotConfiguredError: class extends Error {},
}));

const me = (emailVerified: boolean) => ({
  id: 'u1',
  email: 'yasmine@example.com',
  displayName: 'Yasmine',
  emailVerified,
  hasGoogle: false,
  hasPassword: true,
  createdAt: '2026-10-10T10:00:00.000Z',
});

const tokens = { accessToken: 'access-2', refreshToken: 'refresh-2', accessTokenExpiresIn: 900 };

let auth: ReturnType<typeof useAuth>;
/** Shows the status and hands the context value to the test (after each render). */
function Probe({ expose }: { expose: (value: ReturnType<typeof useAuth>) => void }) {
  const value = useAuth();
  useEffect(() => {
    expose(value);
  });
  return <Text testID="status">{value.status}</Text>;
}

async function boot() {
  // gcTime Infinity: no 5-minute garbage-collection timers keeping Jest alive after the tests.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe
          expose={(value) => {
            auth = value;
          }}
        />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId('status').props.children as string;
const health = (req: SeenRequest) => (req.path === '/health' ? jsonResponse(200, { status: 'ok' }) : null);

beforeEach(async () => {
  secureStore.clear();
  secureStore.set('mr.serverUrl', 'http://api.test');
  await api.clearTokens();
});

describe('AuthProvider state machine', () => {
  it('boots to signedOut when no session is stored', async () => {
    installFetch((req) => health(req) ?? jsonResponse(404));
    await boot();
    await waitFor(() => expect(status()).toBe('signedOut'));
  });

  it('boots to unreachable when the server does not answer', async () => {
    installFetch(() => {
      throw new TypeError('Network request failed');
    });
    await boot();
    await waitFor(() => expect(status()).toBe('unreachable'));
  });

  it('boots to signedIn when /me answers', async () => {
    storeTokens('access-1', 'refresh-1');
    installFetch((req) => health(req) ?? (req.path === '/me' ? jsonResponse(200, me(true)) : jsonResponse(404)));
    await boot();
    await waitFor(() => expect(status()).toBe('signedIn'));
    expect(auth.account?.displayName).toBe('Yasmine');
  });

  it('boots to unverified on EMAIL_NOT_VERIFIED', async () => {
    storeTokens('access-1', 'refresh-1');
    installFetch(
      (req) => health(req) ?? jsonResponse(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email first.' }),
    );
    await boot();
    await waitFor(() => expect(status()).toBe('unverified'));
  });

  it('boots to signedOut and forgets the tokens when the session is revoked', async () => {
    storeTokens('access-1', 'refresh-1');
    installFetch((req) => health(req) ?? jsonResponse(401, { code: 'SESSION_REVOKED', message: 'Revoked' }));
    await boot();
    await waitFor(() => expect(status()).toBe('signedOut'));
    expect(secureStore.has('mr.refreshToken')).toBe(false);
  });

  it('login → signedIn; signup of an unverified account → unverified; logout → signedOut', async () => {
    const seen = installFetch((req) => {
      if (req.path === '/health') return jsonResponse(200, { status: 'ok' });
      if (req.path === '/auth/login') return jsonResponse(200, { user: me(true), ...tokens });
      if (req.path === '/auth/signup') return jsonResponse(201, { user: me(false), ...tokens });
      if (req.path === '/auth/logout') return jsonResponse(204);
      return jsonResponse(404);
    });
    await boot();
    await waitFor(() => expect(status()).toBe('signedOut'));

    await act(() => auth.login({ email: 'yasmine@example.com', password: 'correct horse' }));
    expect(status()).toBe('signedIn');
    expect(secureStore.get('mr.refreshToken')).toBe('refresh-2');

    await act(() => auth.logout());
    expect(status()).toBe('signedOut');
    expect(seen.find((r) => r.path === '/auth/logout')?.body).toEqual({ refreshToken: 'refresh-2' });
    expect(secureStore.has('mr.refreshToken')).toBe(false);

    await act(() => auth.signup({ email: 'yasmine@example.com', password: 'correct horse', displayName: 'Yasmine' }));
    expect(status()).toBe('unverified');
  });

  it('returns to signedOut when a refresh is refused mid-session', async () => {
    storeTokens('access-1', 'refresh-1');
    let revoked = false;
    installFetch((req) => {
      if (req.path === '/health') return jsonResponse(200, { status: 'ok' });
      if (req.path === '/me' && !revoked) return jsonResponse(200, me(true));
      if (req.path === '/auth/refresh') return jsonResponse(401, { code: 'SESSION_REVOKED', message: 'Revoked' });
      return jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired' });
    });
    await boot();
    await waitFor(() => expect(status()).toBe('signedIn'));

    revoked = true;
    await act(async () => {
      await api.request('/events').catch(() => undefined);
    });
    expect(status()).toBe('signedOut');
  });
});
