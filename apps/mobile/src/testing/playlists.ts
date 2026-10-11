import type { PlaylistDetail, PlaylistEntry, PlaylistState } from '../api/playlists';
import type { UserRef } from '../api/users';

export const sam: UserRef = { id: 'u-sam', displayName: 'Sam' };
export const yasmine: UserRef = { id: 'u-yasmine', displayName: 'Yasmine' };

export function entry(id: string, title = `Title ${id}`): PlaylistEntry {
  return {
    id,
    position: 0,
    addedBy: yasmine,
    track: { id: `t-${id}`, title, artist: 'Artist', artworkUrl: null, durationSec: 200 },
  };
}

/** Shared state with the entries in the given order (positions 0..n-1). */
export function state(version: number, entries: PlaylistEntry[], lastEditor: UserRef | null = null): PlaylistState {
  return {
    playlist: { id: 'p1', name: 'Road trip', description: '', owner: yasmine, visibility: 'public', license: 'everyone' },
    tracks: entries.map((e, position) => ({ ...e, position })),
    version,
    lastEditor,
  };
}

export function detail(version: number, entries: PlaylistEntry[], own: Partial<PlaylistDetail> = {}): PlaylistDetail {
  return {
    ...state(version, entries),
    isOwner: true,
    canEdit: { allowed: true, reason: null },
    viewers: [],
    ...own,
  };
}
