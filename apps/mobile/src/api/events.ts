import { api } from './client';
import type { Track } from './music';
import type { UserRef } from './users';

export type Visibility = 'public' | 'private';
export type License = 'everyone' | 'invited' | 'on_site';
export type Scope = 'discover' | 'hosting' | 'invited' | 'joined';
export type DenyReason = 'NOT_INVITED' | 'OUTSIDE_AREA' | 'OUTSIDE_TIME_WINDOW' | 'LOCATION_REQUIRED';

export interface EventInfo {
  id: string;
  name: string;
  description: string;
  host: UserRef;
  visibility: Visibility;
  license: License;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  startsAt: string | null;
  endsAt: string | null;
}

export interface Suggestion {
  id: string;
  track: Track;
  voteCount: number;
  suggestedBy: UserRef;
  createdAt: string;
}

/** Shared state: what every viewer sees and what socket pushes carry (AD-1). */
export interface EventState {
  event: EventInfo;
  nowPlaying: { track: Track; startedAt: string } | null;
  queue: Suggestion[];
  version: number;
  listeners: number;
}

/** Shared state + the caller's own fields, which only REST returns. */
export interface EventDetail extends EventState {
  isHost: boolean;
  canAct: { allowed: boolean; reason: DenyReason | null };
  myVotes: string[];
}

export type ChangeKind = 'queue' | 'nowPlaying' | 'settings' | 'invites';
export interface QueuePush extends EventState {
  change: ChangeKind;
}

export interface EventSummary {
  id: string;
  name: string;
  host: UserRef;
  visibility: Visibility;
  license: License;
  startsAt: string | null;
  endsAt: string | null;
  live: boolean;
  nowPlaying: Track | null;
  listeners: number;
}

export interface EventInput {
  name?: string;
  description?: string;
  visibility?: Visibility;
  license?: License;
  lat?: number;
  lng?: number;
  radiusM?: number;
  startsAt?: string;
  endsAt?: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

const loc = (coords: Coords | null | undefined) => (coords ? { lat: coords.lat, lng: coords.lng } : {});
const locQuery = (coords: Coords | null | undefined) => (coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '');

export const eventsApi = {
  list: (scope: Scope, q?: string, cursor?: string) => {
    const params = new URLSearchParams({ scope });
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return api.request<{ items: EventSummary[]; nextCursor?: string }>(`/events?${params.toString()}`);
  },
  get: (id: string, coords?: Coords | null) => api.request<EventDetail>(`/events/${id}${locQuery(coords)}`),
  create: (body: EventInput & { name: string }) => api.request<EventDetail>('/events', { method: 'POST', body }),
  update: (id: string, body: EventInput) => api.request<EventDetail>(`/events/${id}`, { method: 'PATCH', body }),
  suggest: (id: string, trackId: string, coords?: Coords | null) =>
    api.request<EventDetail>(`/events/${id}/suggestions`, { method: 'POST', body: { trackId, ...loc(coords) } }),
  vote: (id: string, suggestionId: string, coords?: Coords | null) =>
    api.request<EventDetail>(`/events/${id}/suggestions/${suggestionId}/vote`, { method: 'PUT', body: loc(coords) }),
  unvote: (id: string, suggestionId: string) =>
    api.request<EventDetail>(`/events/${id}/suggestions/${suggestionId}/vote`, { method: 'DELETE' }),
  advance: (id: string, expectedNowPlayingId: string | null) =>
    api.request<EventDetail>(`/events/${id}/advance`, { method: 'POST', body: { expectedNowPlayingId } }),
  invites: (id: string) => api.request<{ items: UserRef[] }>(`/events/${id}/invites`),
  invite: (id: string, userId: string) => api.request<{ items: UserRef[] }>(`/events/${id}/invites/${userId}`, { method: 'PUT' }),
  uninvite: (id: string, userId: string) =>
    api.request<{ items: UserRef[] }>(`/events/${id}/invites/${userId}`, { method: 'DELETE' }),
};
