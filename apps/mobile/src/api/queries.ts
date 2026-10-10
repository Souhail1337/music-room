import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ApiError } from './errors';
import { eventsApi, type Coords, type EventDetail, type EventState, type QueuePush, type Scope } from './events';
import { musicApi } from './music';
import { realtime } from './socket';
import { usersApi } from './users';

export const queryKeys = {
  event: (id: string) => ['event', id] as const,
  events: (scope: Scope, q: string) => ['events', scope, q] as const,
  allEvents: ['events'] as const,
  music: (q: string) => ['music', q] as const,
  users: (q: string) => ['users', q] as const,
  invites: (id: string) => ['invites', id] as const,
};

/** 404 and 403 are answers, not glitches: don't retry them. */
const retry = (count: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1;

/**
 * Merges a REST answer into the cache. Shared state comes from whichever copy is newer (a push may
 * have overtaken the response); the caller's own fields always come from the response.
 */
export function mergeDetail(old: EventDetail | undefined, next: EventDetail): EventDetail {
  if (!old || next.version >= old.version) return next;
  return { ...old, isHost: next.isHost, canAct: next.canAct, myVotes: next.myVotes };
}

/** Applies a push: drop it unless its version is newer than the one we hold (AD-1). */
export function applyPush(old: EventDetail | undefined, push: EventState): EventDetail | undefined {
  if (!old || push.version <= old.version) return old;
  return {
    ...old,
    event: push.event,
    nowPlaying: push.nowPlaying,
    queue: push.queue,
    version: push.version,
    listeners: push.listeners,
  };
}

function sortQueue(queue: EventDetail['queue']): EventDetail['queue'] {
  return [...queue].sort((a, b) => b.voteCount - a.voteCount || a.createdAt.localeCompare(b.createdAt));
}

function withVote(detail: EventDetail, suggestionId: string, vote: boolean): EventDetail {
  const has = detail.myVotes.includes(suggestionId);
  if (has === vote) return detail;
  return {
    ...detail,
    myVotes: vote ? [...detail.myVotes, suggestionId] : detail.myVotes.filter((s) => s !== suggestionId),
    queue: sortQueue(
      detail.queue.map((s) => (s.id === suggestionId ? { ...s, voteCount: s.voteCount + (vote ? 1 : -1) } : s)),
    ),
  };
}

// --- Lists --------------------------------------------------------------------------------------

export function useEventList(scope: Scope, q: string) {
  return useQuery({
    queryKey: queryKeys.events(scope, q),
    queryFn: () => eventsApi.list(scope, q || undefined),
    placeholderData: keepPreviousData,
  });
}

export function useTrackSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.music(q),
    queryFn: () => musicApi.search(q),
    enabled: q.length > 0,
    staleTime: 10 * 60_000,
    retry,
  });
}

export function useUserSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.users(q),
    queryFn: () => usersApi.search(q),
    enabled: q.length >= 2,
    retry,
  });
}

export function useInvites(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.invites(eventId),
    queryFn: () => eventsApi.invites(eventId),
    enabled,
    retry,
  });
}

// --- One event ----------------------------------------------------------------------------------

/**
 * The event detail. Its cache is the single copy of the event on the phone: REST answers and
 * socket pushes both write into it. `coords` is sent along for on-site events (AD-5).
 */
export function useEventDetail(id: string, coords: Coords | null) {
  const coordsRef = useRef(coords);
  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);
  const query = useQuery({
    queryKey: queryKeys.event(id),
    queryFn: () => eventsApi.get(id, coordsRef.current),
    retry,
  });
  // canAct depends on where we are: refetch when the position becomes known or changes.
  const coordsKey = coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : '';
  const { refetch } = query;
  useEffect(() => {
    if (coordsKey) void refetch();
  }, [coordsKey, refetch]);
  return query;
}

export function useRealtimeStatus() {
  return useSyncExternalStore(realtime.subscribe, realtime.getStatus);
}

/** Joins `event:<id>` while mounted and writes pushes into the event cache (AD-1). */
export function useEventRoom(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const key = queryKeys.event(id);
    return realtime.join(`event:${id}`, {
      onEvent: (event, payload) => {
        if (event === 'queue.updated') {
          const push = payload as QueuePush;
          queryClient.setQueryData<EventDetail>(key, (old) => applyPush(old, push));
          // Settings or invites may change what *I* can do: only REST knows that.
          if (push.change === 'settings' || push.change === 'invites') void queryClient.invalidateQueries({ queryKey: key });
        } else if (event === 'presence.updated') {
          const { listeners } = payload as { listeners: number };
          queryClient.setQueryData<EventDetail>(key, (old) => (old ? { ...old, listeners } : old));
        }
      },
      // After every (re)connect: refetch the full state, then keep applying pushes.
      onResync: () => void queryClient.invalidateQueries({ queryKey: key }),
      onRefused: () => void queryClient.invalidateQueries({ queryKey: key }),
    });
  }, [enabled, id, queryClient]);
}

/** Announces politely when one of *my* tracks changes position (not on every push). */
export function useAnnounceMyTracks(detail: EventDetail | undefined, myUserId: string | undefined) {
  const positions = useRef(new Map<string, number>());
  useEffect(() => {
    if (!detail || !myUserId) return;
    const next = new Map<string, number>();
    detail.queue.forEach((s, index) => {
      if (s.suggestedBy.id !== myUserId) return;
      next.set(s.id, index);
      const before = positions.current.get(s.id);
      if (before !== undefined && before !== index)
        AccessibilityInfo.announceForAccessibility(`${s.track.title} is now number ${index + 1} in the queue.`);
    });
    positions.current = next;
  }, [detail, myUserId]);
}

function setDetail(queryClient: QueryClient, id: string, data: EventDetail) {
  queryClient.setQueryData<EventDetail>(queryKeys.event(id), (old) => mergeDetail(old, data));
}

/** Vote / unvote: optimistic, then reconciled with the server's answer; reverted on refusal. */
export function useVote(id: string, coords: Coords | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.event(id);
  return useMutation({
    mutationFn: ({ suggestionId, vote }: { suggestionId: string; vote: boolean }) =>
      vote ? eventsApi.vote(id, suggestionId, coords) : eventsApi.unvote(id, suggestionId),
    onMutate: async ({ suggestionId, vote }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<EventDetail>(key, (old) => (old ? withVote(old, suggestionId, vote) : old));
    },
    onError: (_error, { suggestionId, vote }) => {
      queryClient.setQueryData<EventDetail>(key, (old) => (old ? withVote(old, suggestionId, !vote) : old));
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onSuccess: (data) => setDetail(queryClient, id, data),
  });
}

export function useSuggest(id: string, coords: Coords | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trackId: string) => eventsApi.suggest(id, trackId, coords),
    onSuccess: (data) => {
      setDetail(queryClient, id, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.allEvents });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: queryKeys.event(id) }),
  });
}

export function useAdvance(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expectedNowPlayingId: string | null) => eventsApi.advance(id, expectedNowPlayingId),
    onSuccess: (data) => setDetail(queryClient, id, data),
  });
}

/** Writes a fresh REST answer (create / edit) into the caches. */
export function useStoreEvent() {
  const queryClient = useQueryClient();
  return (data: EventDetail) => {
    setDetail(queryClient, data.event.id, data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.allEvents });
  };
}
