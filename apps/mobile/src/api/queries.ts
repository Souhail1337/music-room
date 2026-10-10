import { keepPreviousData, useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { ME_QUERY_KEY } from '../auth/AuthProvider';
import { ApiError } from './errors';
import { eventsApi, type Coords, type EventDetail, type EventState, type QueuePush, type Scope } from './events';
import { musicApi } from './music';
import {
  playlistsApi,
  type PlaylistDetail,
  type PlaylistPush,
  type PlaylistScope,
  type PlaylistState,
  type VersionConflictDetails,
} from './playlists';
import { realtime } from './socket';
import { friendsApi, usersApi, type Profile, type ProfileUpdate, type UserRef } from './users';

export const queryKeys = {
  event: (id: string) => ['event', id] as const,
  events: (scope: Scope, q: string) => ['events', scope, q] as const,
  allEvents: ['events'] as const,
  music: (q: string) => ['music', q] as const,
  users: (q: string) => ['users', q] as const,
  invites: (id: string) => ['invites', id] as const,
  playlist: (id: string) => ['playlist', id] as const,
  playlists: (scope: PlaylistScope, q: string) => ['playlists', scope, q] as const,
  allPlaylists: ['playlists'] as const,
  playlistInvites: (id: string) => ['playlistInvites', id] as const,
  myProfile: ['profile', 'me'] as const,
  profile: (id: string) => ['profile', id] as const,
  allProfiles: ['profile'] as const,
  friends: ['friends'] as const,
  friendRequests: ['friendRequests'] as const,
  allUsers: ['users'] as const,
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

// --- Playlists (FR-17..FR-21) -------------------------------------------------------------------

/** Same rule as events: shared state from the newer copy, the caller's own fields from REST. */
export function mergePlaylist(old: PlaylistDetail | undefined, next: PlaylistDetail): PlaylistDetail {
  if (!old || next.version >= old.version) return next;
  return { ...old, isOwner: next.isOwner, canEdit: next.canEdit };
}

/**
 * Writes server shared state (a push, or the `details.playlist` of a 409) into the cache. Drops it
 * unless its version is newer than ours (AD-1); `force` also accepts the same version, so a 409
 * snaps an optimistic reorder (made without a version bump) back to the server order.
 */
export function applyPlaylistState(
  old: PlaylistDetail | undefined,
  state: PlaylistState,
  force = false,
): PlaylistDetail | undefined {
  if (!old) return old;
  if (state.version < old.version || (!force && state.version === old.version)) return old;
  return { ...old, playlist: state.playlist, tracks: state.tracks, version: state.version, lastEditor: state.lastEditor };
}

export function usePlaylistList(scope: PlaylistScope, q: string) {
  return useQuery({
    queryKey: queryKeys.playlists(scope, q),
    queryFn: () => playlistsApi.list(scope, q || undefined),
    placeholderData: keepPreviousData,
  });
}

/** The playlist detail: the single copy of the playlist on the phone (REST answers + pushes). */
export function usePlaylistDetail(id: string) {
  return useQuery({ queryKey: queryKeys.playlist(id), queryFn: () => playlistsApi.get(id), retry });
}

export function usePlaylistInvites(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.playlistInvites(id),
    queryFn: () => playlistsApi.invites(id),
    enabled,
    retry,
  });
}

/** Joins `playlist:<id>` while mounted: pushes write into the cache, presence keeps the avatars live. */
export function usePlaylistRoom(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const key = queryKeys.playlist(id);
    return realtime.join(`playlist:${id}`, {
      onEvent: (event, payload) => {
        if (event === 'playlist.updated') {
          const push = payload as PlaylistPush;
          queryClient.setQueryData<PlaylistDetail>(key, (old) => applyPlaylistState(old, push));
          // Settings or invites may change what *I* can do: only REST knows that.
          if (push.change === 'settings' || push.change === 'invites') void queryClient.invalidateQueries({ queryKey: key });
        } else if (event === 'presence.updated') {
          const { viewers } = payload as { viewers?: UserRef[] };
          if (viewers) queryClient.setQueryData<PlaylistDetail>(key, (old) => (old ? { ...old, viewers } : old));
        }
      },
      onResync: () => void queryClient.invalidateQueries({ queryKey: key }),
      onRefused: () => void queryClient.invalidateQueries({ queryKey: key }),
    });
  }, [enabled, id, queryClient]);
}

export function conflictOf(error: unknown): VersionConflictDetails | null {
  return error instanceof ApiError && error.code === 'VERSION_CONFLICT' ? (error.details as VersionConflictDetails) : null;
}

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

const editKey = (id: string) => ['playlistEdit', id] as const;

/** True while any track edit of this playlist is in flight (on any screen): edit controls stay disabled. */
export function usePlaylistEditPending(id: string): boolean {
  return useIsMutating({ mutationKey: editKey(id) }) > 0;
}

/**
 * Track edits (AD-3). Each request carries an explicit `baseVersion`: the version of the list the
 * user acted on (captured when the gesture, menu or sheet started), never whatever the cache holds
 * when the request leaves. On 409 the server state wins: it is written to the cache as-is and the
 * edit is NOT re-applied; the screen tells the user who changed the list.
 */
export function usePlaylistEdits(id: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.playlist(id);
  const current = () => queryClient.getQueryData<PlaylistDetail>(key);
  const store = (data: PlaylistDetail) => {
    queryClient.setQueryData<PlaylistDetail>(key, (old) => mergePlaylist(old, data));
    void queryClient.invalidateQueries({ queryKey: queryKeys.allPlaylists });
  };
  const onFailure = (error: unknown) => {
    const details = conflictOf(error);
    if (details) queryClient.setQueryData<PlaylistDetail>(key, (old) => applyPlaylistState(old, details.playlist, true));
    else void queryClient.invalidateQueries({ queryKey: key });
  };

  const add = useMutation({
    mutationKey: editKey(id),
    mutationFn: ({ trackId, baseVersion }: { trackId: string; baseVersion: number }) =>
      playlistsApi.addTrack(id, trackId, baseVersion),
    onSuccess: store,
    onError: onFailure,
  });

  const move = useMutation({
    mutationKey: editKey(id),
    mutationFn: ({ entryId, toIndex, baseVersion }: { entryId: string; toIndex: number; baseVersion: number }) =>
      playlistsApi.moveTrack(id, entryId, toIndex, baseVersion),
    // Optimistic: the row stays where it was dropped; the answer (or a push) replaces it.
    onMutate: async ({ entryId, toIndex, baseVersion }) => {
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<PlaylistDetail>(key, (old) => {
        // The list changed since the user acted: leave it; the server will answer 409.
        if (!old || old.version !== baseVersion) return old;
        const from = old.tracks.findIndex((e) => e.id === entryId);
        if (from < 0 || toIndex < 0 || toIndex >= old.tracks.length) return old;
        return { ...old, tracks: reorder(old.tracks, from, toIndex).map((e, position) => ({ ...e, position })) };
      });
    },
    onSuccess: store,
    onError: onFailure,
  });

  const remove = useMutation({
    mutationKey: editKey(id),
    mutationFn: ({ entryId, baseVersion }: { entryId: string; baseVersion: number }) =>
      playlistsApi.removeTrack(id, entryId, baseVersion),
    onSuccess: store,
    onError: onFailure,
  });

  return { add, move, remove, current };
}

/** Writes a fresh REST answer (create / edit) into the caches. */
export function useStorePlaylist() {
  const queryClient = useQueryClient();
  return (data: PlaylistDetail) => {
    queryClient.setQueryData<PlaylistDetail>(queryKeys.playlist(data.playlist.id), (old) => mergePlaylist(old, data));
    void queryClient.invalidateQueries({ queryKey: queryKeys.allPlaylists });
  };
}

// --- Profile and friends (FR-3, FR-6..FR-8) ------------------------------------------------------

export function useMyProfile() {
  return useQuery({ queryKey: queryKeys.myProfile, queryFn: usersApi.myProfile, retry });
}

/** Someone's profile, as much of it as the server lets me see (AD-7). */
export function useProfile(id: string) {
  return useQuery({ queryKey: queryKeys.profile(id), queryFn: () => usersApi.profile(id), retry });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) => usersApi.updateProfile(body),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.myProfile, profile);
      queryClient.setQueryData(queryKeys.profile(profile.id), profile);
      // The account query carries the display name too.
      void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useFriends() {
  return useQuery({ queryKey: queryKeys.friends, queryFn: friendsApi.list, retry });
}

export function useFriendRequests() {
  return useQuery({ queryKey: queryKeys.friendRequests, queryFn: friendsApi.requests, retry });
}

/**
 * Friend actions. No realtime for friendships: after each one, every list and profile that depends
 * on it is refetched; a returned profile is written straight into its cache.
 */
export function useFriendActions() {
  const queryClient = useQueryClient();
  const settle = (profile?: Profile | void) => {
    if (profile) queryClient.setQueryData(queryKeys.profile(profile.id), profile);
    void queryClient.invalidateQueries({ queryKey: queryKeys.friends });
    void queryClient.invalidateQueries({ queryKey: queryKeys.friendRequests });
    void queryClient.invalidateQueries({ queryKey: queryKeys.allUsers });
    if (!profile) void queryClient.invalidateQueries({ queryKey: queryKeys.allProfiles });
  };
  const opts = { onSettled: (data: Profile | void | undefined) => settle(data ?? undefined) };
  return {
    request: useMutation({ mutationFn: (userId: string) => friendsApi.request(userId), ...opts }),
    accept: useMutation({ mutationFn: (requestId: string) => friendsApi.accept(requestId), ...opts }),
    decline: useMutation({ mutationFn: (requestId: string) => friendsApi.decline(requestId), ...opts }),
    cancel: useMutation({ mutationFn: (requestId: string) => friendsApi.cancel(requestId), ...opts }),
    remove: useMutation({ mutationFn: (userId: string) => friendsApi.remove(userId), ...opts }),
  };
}
