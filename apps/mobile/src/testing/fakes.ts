/**
 * Test helpers: an in-memory expo-secure-store and a scripted `fetch`, so the real ApiClient and
 * AuthProvider run unchanged in Jest. Only used by `src/**\/__tests__`.
 */

/** Backing map for the expo-secure-store mock (`jest.mock('expo-secure-store', () => secureStoreMock)`). */
export const secureStore = new Map<string, string>();

export const secureStoreMock = {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
};

export function storeTokens(accessToken: string, refreshToken: string): void {
  secureStore.set('mr.accessToken', accessToken);
  secureStore.set('mr.refreshToken', refreshToken);
}

/** A minimal Response: the client only reads `status`, `ok`, `text()` and `json()`. */
export function jsonResponse(status: number, body?: unknown): Response {
  const text = body === undefined ? '' : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as Response;
}

export interface SeenRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (req: SeenRequest) => Response | Promise<Response>;

/**
 * Replaces global fetch with `handler`. Returns the list of requests seen (path without the server URL).
 */
export function installFetch(handler: Handler): SeenRequest[] {
  const seen: SeenRequest[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const req: SeenRequest = {
      method: init?.method ?? 'GET',
      path: url.pathname + url.search,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    seen.push(req);
    return handler(req);
  }) as typeof fetch;
  return seen;
}

export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};
