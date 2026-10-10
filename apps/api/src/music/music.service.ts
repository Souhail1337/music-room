import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import type { Track } from '../generated/prisma/client.js';
import { DeezerClient, DeezerUnavailableError } from './deezer.client.js';
import { TracksRepository } from './tracks.repository.js';
import { TrackView } from './track.view.js';

export const SEARCH_TTL_MS = 10 * 60_000;
const SEARCH_CACHE_MAX = 500;
const TRACK_ID = /^\d{1,20}$/;

/** Deezer behind a cache (AD-8): the app never calls Deezer, Track rows are keyed by Deezer ID. */
@Injectable()
export class MusicService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; items: TrackView[] }
  >();

  constructor(
    private readonly deezer: DeezerClient,
    private readonly tracks: TracksRepository,
    private readonly now: () => number = Date.now,
  ) {}

  /** ≤ 25 tracks; the same query within 10 minutes is served from the cache. */
  async search(q: string): Promise<TrackView[]> {
    const key = q.trim().toLowerCase().replace(/\s+/g, ' ');
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.items;
    this.cache.delete(key);

    const items = (await this.call(() => this.deezer.search(key, 25))).map(
      (t) => TrackView.of(t),
    );
    if (this.cache.size >= SEARCH_CACHE_MAX) {
      // Maps keep insertion order: drop the oldest entry.
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: this.now() + SEARCH_TTL_MS, items });
    return items;
  }

  /**
   * Returns the Track row, creating it from Deezer the first time it is used. Titles and artists
   * always come from Deezer, never from the client. Unknown id → 404 TRACK_NOT_FOUND.
   */
  async ensureTrack(id: string): Promise<Track> {
    if (!TRACK_ID.test(id)) throw Errors.trackNotFound();
    const existing = await this.tracks.findById(id);
    if (existing) return existing;
    const fresh = await this.call(() => this.deezer.getTrack(id));
    if (!fresh) throw Errors.trackNotFound();
    return this.tracks.upsert({
      id: fresh.id,
      title: fresh.title,
      artist: fresh.artist,
      artworkUrl: fresh.artworkUrl,
      durationSec: fresh.durationSec,
    });
  }

  /** A fresh preview URL, fetched from Deezer on every call (never stored). */
  async preview(id: string): Promise<{ trackId: string; previewUrl: string }> {
    if (!TRACK_ID.test(id)) throw Errors.trackNotFound();
    const fresh = await this.call(() => this.deezer.getTrack(id));
    if (!fresh) throw Errors.trackNotFound();
    if (!fresh.previewUrl) throw Errors.previewUnavailable();
    return { trackId: fresh.id, previewUrl: fresh.previewUrl };
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DeezerUnavailableError)
        throw Errors.musicUnavailable();
      throw error;
    }
  }
}
