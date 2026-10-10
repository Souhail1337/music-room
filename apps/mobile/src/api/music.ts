import { api } from './client';

/** A Deezer track as the API returns it (the app never calls Deezer itself, AD-8). */
export interface Track {
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationSec: number;
}

export const musicApi = {
  search: (q: string) => api.request<{ items: Track[] }>(`/music/search?q=${encodeURIComponent(q)}`),
  /** A fresh 30-second preview URL. Fetch it just before playing; never keep it. */
  preview: (trackId: string) =>
    api.request<{ trackId: string; previewUrl: string }>(`/music/tracks/${encodeURIComponent(trackId)}/preview`),
};
