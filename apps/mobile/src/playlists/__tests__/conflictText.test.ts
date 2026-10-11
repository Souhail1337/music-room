import { conflictText } from '../copy';
import { entry, sam, state, yasmine } from '../../testing/playlists';

const a = entry('a', 'Midnight City');
const b = entry('b', 'One More Time');
const c = entry('c', 'Genesis');
const d = entry('d', 'D.A.N.C.E.');

const conflict = (version: number, entries: ReturnType<typeof entry>[], editor = sam) => ({
  playlist: state(version, entries, editor),
  lastEditor: editor,
});

describe('conflictText', () => {
  it('names the editor who moved a track', () => {
    expect(conflictText(conflict(4, [b, c, a]), state(3, [a, b, c]), 'b', yasmine.id)).toBe(
      'Sam moved Midnight City — list updated.',
    );
  });

  it('names an added track', () => {
    expect(conflictText(conflict(4, [a, b, d]), state(3, [a, b]), null, yasmine.id)).toBe(
      'Sam added D.A.N.C.E. — list updated.',
    );
  });

  it('prefers the removal of the entry the user was editing', () => {
    expect(conflictText(conflict(4, [a, c, d]), state(3, [a, b, c]), 'b', yasmine.id)).toBe(
      'Sam removed One More Time — list updated.',
    );
  });

  it('names a removed track', () => {
    expect(conflictText(conflict(4, [a, c]), state(3, [a, b, c]), 'a', yasmine.id)).toBe(
      'Sam removed One More Time — list updated.',
    );
  });

  it('falls back to "changed" when no single move explains the order (adjacent swap)', () => {
    expect(conflictText(conflict(4, [b, a]), state(3, [a, b]), null, yasmine.id)).toBe(
      'Sam changed the playlist — list updated.',
    );
  });

  it('does not name the user themself, nor an unknown editor', () => {
    expect(conflictText(conflict(4, [b, a, c], yasmine), state(3, [a, b, c]), 'b', yasmine.id)).toBe(
      'The playlist changed — list updated.',
    );
    expect(
      conflictText({ playlist: state(4, [a]), lastEditor: null }, state(3, [a, b]), null, yasmine.id),
    ).toBe('The playlist changed — list updated.');
  });
});
