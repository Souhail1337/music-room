import { api, normalizeServerUrl } from '../client';
import { ApiError, NetworkError } from '../errors';
import { deferred, installFetch, jsonResponse, secureStore } from '../../testing/fakes';

jest.mock('expo-secure-store', () => require('../../testing/fakes').secureStoreMock);

const OLD = { accessToken: 'access-1', refreshToken: 'refresh-1' };
const NEW = { accessToken: 'access-2', refreshToken: 'refresh-2', accessTokenExpiresIn: 900 };

beforeEach(async () => {
  secureStore.clear();
  api.setSessionEndedHandler(null);
  await api.setServerUrl('http://api.test');
  await api.setTokens(OLD);
});

describe('normalizeServerUrl', () => {
  it.each([
    ['192.168.1.20:3000', 'http://192.168.1.20:3000'],
    ['  http://localhost:3000/  ', 'http://localhost:3000'],
    ['https://music.example.com///', 'https://music.example.com'],
    ['HTTP://Host:3000', 'HTTP://Host:3000'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeServerUrl(input)).toBe(expected);
  });
});

describe('ApiClient', () => {
  it('sends the device headers and the bearer token', async () => {
    const seen = installFetch(() => jsonResponse(200, { ok: true }));
    await api.request('/me');
    expect(seen[0].path).toBe('/me');
    expect(seen[0].headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer access-1',
        'X-Platform': expect.any(String),
        'X-Device': expect.any(String),
        'X-App-Version': expect.any(String),
      }),
    );
  });

  it('refreshes once for parallel 401s (single-flight) and retries each request with the new token', async () => {
    const refreshAnswer = deferred<Response>();
    const seen = installFetch((req) => {
      if (req.path === '/auth/refresh') return refreshAnswer.promise;
      return req.headers.Authorization === 'Bearer access-2'
        ? jsonResponse(200, { path: req.path })
        : jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired' });
    });

    const results = Promise.all([api.request('/a'), api.request('/b'), api.request('/c')]);
    // Let the three first attempts fail before the refresh answers.
    await new Promise((r) => setTimeout(r, 0));
    refreshAnswer.resolve(jsonResponse(200, NEW));

    await expect(results).resolves.toEqual([{ path: '/a' }, { path: '/b' }, { path: '/c' }]);
    const refreshes = seen.filter((r) => r.path === '/auth/refresh');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0].body).toEqual({ refreshToken: 'refresh-1' });
    expect(api.refreshToken).toBe('refresh-2');
    expect(secureStore.get('mr.refreshToken')).toBe('refresh-2');
  });

  it('ends the session when the server refuses the refresh', async () => {
    const ended = jest.fn();
    api.setSessionEndedHandler(ended);
    installFetch((req) =>
      req.path === '/auth/refresh'
        ? jsonResponse(401, { code: 'SESSION_REVOKED', message: 'Revoked' })
        : jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired' }),
    );

    await expect(api.request('/me')).rejects.toMatchObject({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(ended).toHaveBeenCalledTimes(1);
    expect(api.hasSession).toBe(false);
    expect(secureStore.has('mr.refreshToken')).toBe(false);
  });

  it('keeps the session when the refresh fails because the server is unreachable', async () => {
    const ended = jest.fn();
    api.setSessionEndedHandler(ended);
    installFetch((req) => {
      if (req.path === '/auth/refresh') throw new TypeError('Network request failed');
      return jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired' });
    });

    await expect(api.request('/me')).rejects.toBeInstanceOf(NetworkError);
    expect(ended).not.toHaveBeenCalled();
    expect(api.hasSession).toBe(true);
  });

  it('turns an error body into an ApiError with the server code', async () => {
    installFetch(() => jsonResponse(403, { code: 'NOT_INVITED', message: 'Only invited people can vote.' }));
    const error = await api.request('/events/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'NOT_INVITED', message: 'Only invited people can vote.' });
  });
});
