import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A track as Deezer describes it, reduced to what Music Room uses. */
export interface DeezerTrack {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationSec: number;
  /** 30-second MP3. Short-lived signed URL: never stored (AD-8). */
  previewUrl: string | null;
}

/** Deezer could not be reached, timed out or answered with an error that isn't "no such track". */
export class DeezerUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Deezer is unavailable');
    this.name = 'DeezerUnavailableError';
    this.cause = cause;
  }
}

interface RawTrack {
  id?: number | string;
  title?: string;
  duration?: number;
  preview?: string;
  readable?: boolean;
  artist?: { name?: string };
  album?: { cover_medium?: string; cover?: string };
}

interface RawError {
  error?: { type?: string; message?: string; code?: number };
}

const TIMEOUT_MS = 5_000;
/** Deezer "no data" error code (unknown track id). */
const NO_DATA = 800;

function toTrack(raw: RawTrack): DeezerTrack | null {
  if (raw.id === undefined || !raw.title) return null;
  return {
    id: String(raw.id),
    title: raw.title,
    artist: raw.artist?.name ?? 'Unknown artist',
    artworkUrl: raw.album?.cover_medium ?? raw.album?.cover ?? null,
    durationSec: typeof raw.duration === 'number' ? raw.duration : 0,
    previewUrl: raw.preview ? raw.preview : null,
  };
}

/** The only place that talks to api.deezer.com (AD-8). 5s timeout per call. */
@Injectable()
export class DeezerClient {
  private readonly logger = new Logger(DeezerClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('DEEZER_API_URL') ?? 'https://api.deezer.com'
    ).replace(/\/+$/, '');
  }

  async search(q: string, limit = 25): Promise<DeezerTrack[]> {
    const body = await this.get<{ data?: RawTrack[] } & RawError>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    if (body.error) throw new DeezerUnavailableError(body.error);
    return (body.data ?? [])
      .filter((t) => t.readable !== false)
      .map(toTrack)
      .filter((t): t is DeezerTrack => t !== null)
      .slice(0, limit);
  }

  /** Returns null when Deezer has no such track. */
  async getTrack(id: string): Promise<DeezerTrack | null> {
    const body = await this.get<RawTrack & RawError>(
      `/track/${encodeURIComponent(id)}`,
    );
    if (body.error) {
      if (body.error.code === NO_DATA) return null;
      throw new DeezerUnavailableError(body.error);
    }
    return toTrack(body);
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`Deezer request failed: ${String(error)}`);
      throw new DeezerUnavailableError(error);
    }
    if (!res.ok) throw new DeezerUnavailableError(`HTTP ${res.status}`);
    try {
      return (await res.json()) as T;
    } catch (error) {
      throw new DeezerUnavailableError(error);
    }
  }
}
