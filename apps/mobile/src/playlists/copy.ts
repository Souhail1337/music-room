import { ApiError, errorMessage } from '../api/errors';
import type { PlaylistLicense, PlaylistState, VersionConflictDetails } from '../api/playlists';

export function playlistLicenseLabel(license: PlaylistLicense): string {
  return license === 'everyone' ? 'Everyone can edit' : 'Invited can edit';
}

/** A user-facing sentence for an error on a playlist screen (EXPERIENCE.md voice). */
export function playlistErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'READ_ONLY':
        return 'Only invited people can edit this playlist.';
      case 'TRACK_ALREADY_IN_PLAYLIST':
        return 'Already added.';
      case 'NOT_FOUND':
        return error.message;
    }
  }
  return errorMessage(error);
}

/**
 * The one entry whose move explains the difference between two orders: removing it from both
 * makes them equal. Null when the orders are equal, or when no single entry (or several,
 * e.g. an adjacent swap) qualifies.
 */
function movedEntry(prev: string[], after: string[]): string | null {
  const common = new Set(prev.filter((id) => after.includes(id)));
  const a = prev.filter((id) => common.has(id));
  const b = after.filter((id) => common.has(id));
  if (a.every((id, i) => b[i] === id)) return null;
  const without = (list: string[], id: string) => list.filter((x) => x !== id).join(',');
  const candidates = a.filter((id) => without(a, id) === without(b, id));
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * The conflict snackbar: names the editor whose change won and what it did, e.g.
 * "Sam moved Midnight City — list updated." `before` is the list the user edited from;
 * `entryId` is the entry they tried to change (if any).
 */
export function conflictText(
  details: VersionConflictDetails,
  before: PlaylistState | undefined,
  entryId: string | null,
  myUserId: string | undefined,
): string {
  const editor = details.lastEditor;
  const who = editor && editor.id !== myUserId ? editor.displayName : null;
  const after = details.playlist.tracks;
  const prev = before?.tracks ?? [];
  const tail = ' — list updated.';
  if (!who) return `The playlist changed${tail}`;

  const afterIds = new Set(after.map((e) => e.id));
  // The track the user was editing is gone: that is the change that matters to them.
  const mine = entryId ? prev.find((e) => e.id === entryId) : undefined;
  if (mine && !afterIds.has(mine.id)) return `${who} removed ${mine.track.title}${tail}`;

  const prevIds = new Set(prev.map((e) => e.id));
  const added = after.find((e) => !prevIds.has(e.id));
  if (added) return `${who} added ${added.track.title}${tail}`;
  const removed = prev.find((e) => !afterIds.has(e.id));
  if (removed) return `${who} removed ${removed.track.title}${tail}`;
  const movedId = movedEntry(
    prev.map((e) => e.id),
    after.map((e) => e.id),
  );
  const moved = movedId ? after.find((e) => e.id === movedId) : undefined;
  if (moved) return `${who} moved ${moved.track.title}${tail}`;
  return `${who} changed the playlist${tail}`;
}
