import { appConfig } from '../config';
import { ApiError, NetworkError } from './errors';
import { storage, type StoredTokens } from './storage';

const TIMEOUT_MS = 10_000;

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

/** Headers sent on every request for the action log (AD-10, NFR-10). */
function deviceHeaders(): Record<string, string> {
  return {
    'X-Platform': appConfig.platform,
    'X-Device': appConfig.device,
    'X-App-Version': appConfig.appVersion,
  };
}

async function rawFetch(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new NetworkError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    const err = (body ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? 'Something went wrong.', err.details);
  }
  return body as T;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the access token (default true). */
  auth?: boolean;
}

/**
 * The app's only HTTP client. Every URL is built from the stored serverUrl (AD-11). It adds the X-* headers,
 * the bearer token, and transparently refreshes an expired access token once (single-flight, so two
 * parallel 401s never reuse the same refresh token — which the server would treat as theft).
 */
class ApiClient {
  private baseUrl = appConfig.defaultServerUrl;
  private tokens: StoredTokens | null = null;
  private refreshing: Promise<boolean> | null = null;
  private onSessionEnded: (() => void) | null = null;

  async load(): Promise<void> {
    this.baseUrl = normalizeServerUrl((await storage.getServerUrl()) ?? appConfig.defaultServerUrl);
    this.tokens = await storage.getTokens();
  }

  get serverUrl(): string {
    return this.baseUrl;
  }

  async setServerUrl(url: string): Promise<void> {
    this.baseUrl = normalizeServerUrl(url);
    await storage.setServerUrl(this.baseUrl);
  }

  get hasSession(): boolean {
    return this.tokens !== null;
  }

  get refreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  /** The current access token; the socket client sends it in its handshake. */
  get accessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  /** Refreshes the access token (single-flight). Used when the socket handshake reports an expired token. */
  async refreshSession(): Promise<boolean> {
    if (!this.tokens) return false;
    try {
      return await this.refresh();
    } catch {
      return false;
    }
  }

  async setTokens(tokens: StoredTokens): Promise<void> {
    this.tokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
    await storage.setTokens(this.tokens);
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
    await storage.clearTokens();
  }

  /** Called when the server ends the session (refresh refused) so the UI can return to Welcome. */
  setSessionEndedHandler(handler: (() => void) | null): void {
    this.onSessionEnded = handler;
  }

  /** GET /health on any URL, used by "Test connection" and the boot check. */
  async ping(url = this.baseUrl, timeoutMs = 5_000): Promise<boolean> {
    try {
      const res = await rawFetch(`${normalizeServerUrl(url)}/health`, { headers: deviceHeaders() }, timeoutMs);
      const body = (await res.json().catch(() => null)) as { status?: string } | null;
      return res.ok && body?.status === 'ok';
    } catch {
      return false;
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    const res = await this.send(path, options, auth);
    if (res.status === 401 && auth && this.tokens) {
      if (await this.refresh()) return parse<T>(await this.send(path, options, auth));
    }
    return parse<T>(res);
  }

  private send(path: string, { method = 'GET', body }: RequestOptions, auth: boolean): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...deviceHeaders() };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && this.tokens) headers.Authorization = `Bearer ${this.tokens.accessToken}`;
    return rawFetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = this.tokens?.refreshToken;
    if (!refreshToken) return false;
    try {
      const res = await this.send('/auth/refresh', { method: 'POST', body: { refreshToken } }, false);
      const tokens = await parse<StoredTokens>(res);
      await this.setTokens(tokens);
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await this.clearTokens();
        this.onSessionEnded?.();
      }
      if (error instanceof NetworkError) throw error;
      return false;
    }
  }
}

export const api = new ApiClient();
