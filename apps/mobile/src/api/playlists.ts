import { api } from './client';
import type { Track } from './music';
import type { UserRef } from './users';

export type PlaylistVisibility = 'public' | 'private';
export type PlaylistLicense = 'everyone' | 'invited';
export type PlaylistScope = 'discover' | 'mine' | 'shared';

export interface PlaylistInfo {
  id: string;
  name: string;
  description: string;
  owner: UserRef;
  visibility: PlaylistVisibility;
  license: PlaylistLicense;
}

export interface PlaylistEntry {
  id: string;
  track: Track;
  position: number;
  addedBy: UserRef;
}

/** Shared state: what every viewer sees and what `playlist.updated` pushes carry (AD-1, AD-3). */
export interface PlaylistState {
  playlist: PlaylistInfo;
  tracks: PlaylistEntry[];
  version: number;
  lastEditor: UserRef | null;
}

/** Shared state + the caller's own fields, which only REST returns. `viewers` is kept live by presence pushes. */
export interface PlaylistDetail extends PlaylistState {
  isOwner: boolean;
  canEdit: { allowed: boolean; reason: 'READ_ONLY' | null };
  viewers: UserRef[];
}

export type PlaylistChangeKind = 'tracks' | 'settings' | 'invites';
export interface PlaylistPush extends PlaylistState {
  room: string;
  change: PlaylistChangeKind;
}

/** `details` of a 409 VERSION_CONFLICT: the server state wins (AD-3). */
export interface VersionConflictDetails {
  playlist: PlaylistState;
  lastEditor: UserRef | null;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  owner: UserRef;
  visibility: PlaylistVisibility;
  license: PlaylistLicense;
  trackCount: number;
  artworkUrl: string | null;
  collaborators: UserRef[];
}

export interface PlaylistInput {
  name?: string;
  description?: string;
  visibility?: PlaylistVisibility;
  license?: PlaylistLicense;
}

export const playlistsApi = {
  list: (scope: PlaylistScope, q?: string, cursor?: string) => {
    const params = new URLSearchParams({ scope });
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return api.request<{ items: PlaylistSummary[]; nextCursor?: string }>(`/playlists?${params.toString()}`);
  },
  get: (id: string) => api.request<PlaylistDetail>(`/playlists/${id}`),
  create: (body: PlaylistInput & { name: string }) => api.request<PlaylistDetail>('/playlists', { method: 'POST', body }),
  update: (id: string, body: PlaylistInput) => api.request<PlaylistDetail>(`/playlists/${id}`, { method: 'PATCH', body }),
  addTrack: (id: string, trackId: string, baseVersion: number) =>
    api.request<PlaylistDetail>(`/playlists/${id}/tracks`, { method: 'POST', body: { trackId, baseVersion } }),
  moveTrack: (id: string, entryId: string, toIndex: number, baseVersion: number) =>
    api.request<PlaylistDetail>(`/playlists/${id}/tracks/${entryId}`, { method: 'PATCH', body: { toIndex, baseVersion } }),
  removeTrack: (id: string, entryId: string, baseVersion: number) =>
    api.request<PlaylistDetail>(`/playlists/${id}/tracks/${entryId}?baseVersion=${baseVersion}`, { method: 'DELETE' }),
  invites: (id: string) => api.request<{ items: UserRef[] }>(`/playlists/${id}/invites`),
  invite: (id: string, userId: string) => api.request<{ items: UserRef[] }>(`/playlists/${id}/invites/${userId}`, { method: 'PUT' }),
  uninvite: (id: string, userId: string) =>
    api.request<{ items: UserRef[] }>(`/playlists/${id}/invites/${userId}`, { method: 'DELETE' }),
};
