import type { User } from '../generated/prisma/client.js';
import { MeView, ProfileView } from './user.view.js';

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'target',
    email: 'yasmine@example.com',
    passwordHash: 'argon2-hash',
    displayName: 'Yasmine',
    emailVerifiedAt: new Date('2026-10-10T10:00:00Z'),
    googleSub: 'google-sub',
    publicInfo: { bio: 'House and funk.', city: 'Lyon' },
    friendsInfo: { phone: '+33 6 00 00 00 00', birthday: '1999-04-23' },
    privateInfo: { fullName: 'Yasmine B.', address: '12 rue de la Paix' },
    musicPrefs: { genres: ['House'], artists: ['Daft Punk'] },
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  };
}

const ACCOUNT_KEYS = ['email', 'passwordHash', 'googleSub', 'emailVerifiedAt'];

describe('ProfileView (AD-7)', () => {
  it('shows a stranger only public + music preferences, with hidden sections absent (not null)', () => {
    const view = ProfileView.for('stranger', user());
    expect(view).toEqual({
      id: 'target',
      displayName: 'Yasmine',
      public: { bio: 'House and funk.', city: 'Lyon' },
      musicPrefs: { genres: ['House'], artists: ['Daft Punk'] },
      friendship: 'none',
    });
    expect(view).not.toHaveProperty('friends');
    expect(view).not.toHaveProperty('private');
    for (const key of ACCOUNT_KEYS) expect(view).not.toHaveProperty(key);
  });

  it('keeps friends info from people with a pending request either way', () => {
    for (const friendship of ['incoming', 'outgoing'] as const) {
      const view = ProfileView.for('other', user(), {
        friendship,
        requestId: 'req',
      });
      expect(view).toMatchObject({ friendship, requestId: 'req' });
      expect(view).not.toHaveProperty('friends');
      expect(view).not.toHaveProperty('private');
    }
  });

  it('adds friends info for a friend, never private info', () => {
    const view = ProfileView.for('friend', user(), { friendship: 'friends' });
    expect(view.friends).toEqual({
      phone: '+33 6 00 00 00 00',
      birthday: '1999-04-23',
    });
    expect(view.friendship).toBe('friends');
    expect(view).not.toHaveProperty('private');
    expect(view).not.toHaveProperty('email');
  });

  it('shows everything to the owner, whatever relation is passed', () => {
    const view = ProfileView.for('target', user(), { friendship: 'none' });
    expect(view.friendship).toBe('self');
    expect(view.friends).toBeDefined();
    expect(view.private).toEqual({
      fullName: 'Yasmine B.',
      address: '12 rue de la Paix',
    });
    expect(view).not.toHaveProperty('email');
  });

  it('copies only known fields of a section, so stray JSON never leaks', () => {
    const view = ProfileView.for(
      'target',
      user({
        publicInfo: { bio: 'hi', secret: 'x', city: 42 },
        privateInfo: ['not', 'an', 'object'],
        musicPrefs: { genres: ['House', 7, ''], artists: 'Daft Punk' },
      }),
    );
    expect(view.public).toEqual({ bio: 'hi' });
    expect(view.private).toEqual({});
    expect(view.musicPrefs).toEqual({ genres: ['House'], artists: [] });
  });

  it('defaults empty sections to {} and empty lists', () => {
    const view = ProfileView.for('x', user({ publicInfo: {}, musicPrefs: {} }));
    expect(view.public).toEqual({});
    expect(view.musicPrefs).toEqual({ genres: [], artists: [] });
  });
});

describe('MeView', () => {
  it('reports linked sign-in methods without the secrets', () => {
    const view = MeView.of(user({ googleSub: null }));
    expect(view).toMatchObject({ hasGoogle: false, hasPassword: true });
    expect(view).not.toHaveProperty('passwordHash');
    expect(view).not.toHaveProperty('googleSub');
    expect(view).not.toHaveProperty('privateInfo');
  });
});
