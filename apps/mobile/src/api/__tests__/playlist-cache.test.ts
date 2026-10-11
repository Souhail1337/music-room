import { applyPlaylistState, mergePlaylist } from '../queries';
import { detail, entry, sam, state } from '../../testing/playlists';

jest.mock('expo-secure-store', () => require('../../testing/fakes').secureStoreMock);

const a = entry('a');
const b = entry('b');
const c = entry('c');

describe('applyPlaylistState (pushes and 409 snapshots, AD-1 / AD-3)', () => {
  it('ignores state when nothing is cached yet', () => {
    expect(applyPlaylistState(undefined, state(3, [a]))).toBeUndefined();
  });

  it('applies a newer version and keeps the caller-only fields', () => {
    const old = detail(3, [a, b], { isOwner: false, viewers: [sam] });
    const next = applyPlaylistState(old, state(4, [b, a], sam))!;
    expect(next.version).toBe(4);
    expect(next.tracks.map((e) => e.id)).toEqual(['b', 'a']);
    expect(next.lastEditor).toEqual(sam);
    expect(next.isOwner).toBe(false);
    expect(next.viewers).toEqual([sam]);
  });

  it('drops a stale push (older version)', () => {
    const old = detail(5, [a, b]);
    expect(applyPlaylistState(old, state(4, [b, a]))).toBe(old);
  });

  it('drops a push with the same version unless forced', () => {
    const old = detail(5, [a, b]);
    expect(applyPlaylistState(old, state(5, [b, a]))).toBe(old);
  });

  it('a forced 409 snapshot with the same version undoes an optimistic reorder', () => {
    // Optimistic move c → top, made without bumping the version; the server says version 5 is [a, b, c].
    const optimistic = detail(5, [c, a, b]);
    const next = applyPlaylistState(optimistic, state(5, [a, b, c]), true)!;
    expect(next.tracks.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('even forced, an older snapshot never replaces a newer cache', () => {
    const old = detail(6, [a]);
    expect(applyPlaylistState(old, state(5, [a, b]), true)).toBe(old);
  });
});

describe('mergePlaylist (REST answers)', () => {
  it('takes the REST answer when nothing is cached', () => {
    const next = detail(2, [a]);
    expect(mergePlaylist(undefined, next)).toBe(next);
  });

  it('takes the REST answer when it is at least as new', () => {
    const next = detail(4, [a, b]);
    expect(mergePlaylist(detail(4, [b, a]), next)).toBe(next);
    expect(mergePlaylist(detail(3, [a]), next)).toBe(next);
  });

  it('keeps the newer cached shared state but updates the caller-only fields from an older answer', () => {
    const cached = detail(7, [b, a]);
    const merged = mergePlaylist(cached, detail(6, [a], { isOwner: false, canEdit: { allowed: false, reason: 'READ_ONLY' } }));
    expect(merged.version).toBe(7);
    expect(merged.tracks.map((e) => e.id)).toEqual(['b', 'a']);
    expect(merged.isOwner).toBe(false);
    expect(merged.canEdit).toEqual({ allowed: false, reason: 'READ_ONLY' });
  });
});
