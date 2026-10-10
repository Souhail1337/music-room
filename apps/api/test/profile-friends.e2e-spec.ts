import request from 'supertest';
import { createTestApp, TestApp } from './support/app.js';
import { bearer, TestUser, verifiedUser } from './support/users.js';

/** Covers every row of the I/O & edge-case matrix of spec D (Profile & Friends), plus the leak tests (NFR-14). */
describe('Profile & Friends (e2e)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  let seq = 0;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.logs.flush();
    await t.app.close();
  });

  const FULL = {
    public: { bio: 'House and funk.', city: 'Lyon' },
    friends: { phone: '+33 6 12 34 56 78', birthday: '1999-04-23' },
    private: { fullName: 'Yasmine Benali', address: '12 rue de la Paix' },
    musicPrefs: { genres: ['House', 'Funk'], artists: ['Daft Punk'] },
  };

  /** A user with every profile section filled. */
  async function filledUser(name: string): Promise<TestUser> {
    const user = await verifiedUser(t, name);
    await http().patch('/me/profile').set(bearer(user)).send(FULL).expect(200);
    return user;
  }

  const profileOf = (viewer: TestUser, target: { id: string }) =>
    http().get(`/users/${target.id}/profile`).set(bearer(viewer));

  const sendRequest = (from: TestUser, to: { id: string }) =>
    http().post('/friends/requests').set(bearer(from)).send({ userId: to.id });

  const requestsOf = async (user: TestUser) =>
    (await http().get('/friends/requests').set(bearer(user)).expect(200))
      .body as {
      incoming: { id: string; user: { id: string } }[];
      outgoing: { id: string; user: { id: string } }[];
    };

  async function befriend(a: TestUser, b: TestUser): Promise<void> {
    await sendRequest(a, b).expect(200);
    await sendRequest(b, a).expect(200);
  }

  function expectStrangerView(body: Record<string, unknown>) {
    expect(body).toHaveProperty('public');
    expect(body).toHaveProperty('musicPrefs');
    expect(body).not.toHaveProperty('friends');
    expect(body).not.toHaveProperty('private');
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('googleSub');
    const text = JSON.stringify(body);
    expect(text).not.toContain(FULL.friends.phone);
    expect(text).not.toContain(FULL.private.address);
  }

  describe('edit section', () => {
    it('PATCH one section changes only it; GET /me/profile returns all four', async () => {
      const me = await filledUser('Editor');
      const res = await http()
        .patch('/me/profile')
        .set(bearer(me))
        .send({ public: { bio: '  New bio  ' } })
        .expect(200);
      expect(res.body.public).toEqual({ bio: 'New bio', city: 'Lyon' });
      expect(res.body.friends).toEqual(FULL.friends);

      const mine = await http().get('/me/profile').set(bearer(me)).expect(200);
      expect(mine.body).toMatchObject({
        id: me.id,
        displayName: 'Editor',
        friendship: 'self',
        public: { bio: 'New bio', city: 'Lyon' },
        friends: FULL.friends,
        private: FULL.private,
        musicPrefs: FULL.musicPrefs,
      });
    });

    it('clears a field with an empty string or list, and edits the display name', async () => {
      const me = await filledUser('Clearer');
      const res = await http()
        .patch('/me/profile')
        .set(bearer(me))
        .send({
          displayName: ' Renamed ',
          public: { city: '' },
          musicPrefs: { genres: [], artists: [' Justice ', 'justice', ''] },
        })
        .expect(200);
      expect(res.body.displayName).toBe('Renamed');
      expect(res.body.public).toEqual({ bio: FULL.public.bio });
      expect(res.body.musicPrefs).toEqual({ genres: [], artists: ['Justice'] });
      const me2 = await http().get('/me').set(bearer(me)).expect(200);
      expect(me2.body.displayName).toBe('Renamed');
    });

    it('an empty birthday clears it while another field is set', async () => {
      const me = await filledUser('Birthday');
      const res = await http()
        .patch('/me/profile')
        .set(bearer(me))
        .send({ friends: { phone: 'x', birthday: '' } })
        .expect(200);
      expect(res.body.friends).toEqual({ phone: 'x' });
      const mine = await http().get('/me/profile').set(bearer(me)).expect(200);
      expect(mine.body.friends).not.toHaveProperty('birthday');
    });

    it.each([
      ['bio too long', { public: { bio: 'x'.repeat(281) } }, 'public.bio'],
      ['city too long', { public: { city: 'x'.repeat(61) } }, 'public.city'],
      [
        'phone too long',
        { friends: { phone: '1'.repeat(31) } },
        'friends.phone',
      ],
      [
        'bad birthday',
        { friends: { birthday: '23/04/1999' } },
        'friends.birthday',
      ],
      [
        'impossible birthday',
        { friends: { birthday: '2026-02-30' } },
        'friends.birthday',
      ],
      [
        'full name too long',
        { private: { fullName: 'x'.repeat(81) } },
        'private.fullName',
      ],
      [
        'address too long',
        { private: { address: 'x'.repeat(201) } },
        'private.address',
      ],
      [
        'too many genres',
        {
          musicPrefs: { genres: Array.from({ length: 11 }, (_, i) => `G${i}`) },
        },
        'musicPrefs.genres',
      ],
      ['unknown field', { public: { email: 'x@y.z' } }, 'public.email'],
      ['empty display name', { displayName: '  ' }, 'displayName'],
      ['null display name', { displayName: null }, 'displayName'],
    ])('rejects %s with 400 VALIDATION_FAILED', async (_label, body, field) => {
      const me = await verifiedUser(t, 'Invalid');
      const res = await http()
        .patch('/me/profile')
        .set(bearer(me))
        .send(body)
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields)).toContain(field);
    });
  });

  describe('viewing profiles', () => {
    it('a stranger sees public + musicPrefs only — no friends, no private, no email', async () => {
      const target = await filledUser('Target');
      const stranger = await verifiedUser(t, 'Stranger');
      const res = await profileOf(stranger, target).expect(200);
      expect(res.body).toMatchObject({
        id: target.id,
        displayName: 'Target',
        public: FULL.public,
        musicPrefs: FULL.musicPrefs,
        friendship: 'none',
      });
      expectStrangerView(res.body);
    });

    it('unknown or malformed id → 404 USER_NOT_FOUND', async () => {
      const me = await verifiedUser(t, 'Viewer');
      for (const id of ['00000000-0000-4000-8000-000000000000', 'nope']) {
        const res = await profileOf(me, { id }).expect(404);
        expect(res.body.code).toBe('USER_NOT_FOUND');
      }
    });

    it('a friend sees friends info, never private', async () => {
      const target = await filledUser('Pal');
      const friend = await verifiedUser(t, 'Friend');
      await befriend(friend, target);
      const res = await profileOf(friend, target).expect(200);
      expect(res.body.friendship).toBe('friends');
      expect(res.body.friends).toEqual(FULL.friends);
      expect(res.body).not.toHaveProperty('private');
      expect(res.body).not.toHaveProperty('email');
    });

    it('viewing yourself through /users/:id/profile shows all sections', async () => {
      const me = await filledUser('Self');
      const res = await profileOf(me, me).expect(200);
      expect(res.body).toMatchObject({
        friendship: 'self',
        friends: FULL.friends,
        private: FULL.private,
      });
      expect(res.body).not.toHaveProperty('email');
    });

    it('user search never carries profile sections or email (leak test)', async () => {
      const target = await filledUser(`Leaky${Date.now()}`);
      const stranger = await verifiedUser(t, 'Searcher');
      const res = await http()
        .get('/users/search')
        .query({ q: target.email })
        .set(bearer(stranger))
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(Object.keys(res.body.items[0]).sort()).toEqual([
        'displayName',
        'id',
        'isFriend',
      ]);
      for (const key of ['email', 'friends', 'private', 'public', 'musicPrefs'])
        expect(res.body.items[0]).not.toHaveProperty(key);
    });
  });

  describe('friend requests', () => {
    it('A→B: B sees it under incoming, A under outgoing; both profiles show it', async () => {
      const a = await verifiedUser(t, 'Asker');
      const b = await verifiedUser(t, 'Bee');
      const sent = await sendRequest(a, b).expect(200);
      expect(sent.body).toMatchObject({ id: b.id, friendship: 'outgoing' });
      expectStrangerView(sent.body);

      const ofA = await requestsOf(a);
      const ofB = await requestsOf(b);
      expect(ofA.outgoing.map((r) => r.user.id)).toEqual([b.id]);
      expect(ofA.incoming).toEqual([]);
      expect(ofB.incoming.map((r) => r.user.id)).toEqual([a.id]);
      expect(ofB.incoming[0].id).toBe(ofA.outgoing[0].id);
      expect(ofB.incoming[0]).not.toHaveProperty('user.email');

      const seenByB = await profileOf(b, a).expect(200);
      expect(seenByB.body).toMatchObject({
        friendship: 'incoming',
        requestId: ofB.incoming[0].id,
      });
    });

    it('to yourself → 400; unknown user → 404 USER_NOT_FOUND', async () => {
      const a = await verifiedUser(t, 'Solo');
      expect((await sendRequest(a, a).expect(400)).body.code).toBe(
        'VALIDATION_FAILED',
      );
      expect(
        (
          await sendRequest(a, {
            id: '00000000-0000-4000-8000-000000000000',
          }).expect(404)
        ).body.code,
      ).toBe('USER_NOT_FOUND');
    });

    it('a duplicate request is idempotent', async () => {
      const a = await verifiedUser(t, 'Twice');
      const b = await verifiedUser(t, 'Target');
      await sendRequest(a, b).expect(200);
      await sendRequest(a, b).expect(200);
      expect((await requestsOf(b)).incoming).toHaveLength(1);
    });

    it('already friends → 409 ALREADY_FRIENDS', async () => {
      const a = await verifiedUser(t, 'Old');
      const b = await verifiedUser(t, 'Pal');
      await befriend(a, b);
      const res = await sendRequest(a, b).expect(409);
      expect(res.body.code).toBe('ALREADY_FRIENDS');
    });

    it('crossed requests create the friendship and remove both requests', async () => {
      const a = await filledUser('Cross');
      const b = await filledUser('Over');
      await sendRequest(a, b).expect(200);
      const crossed = await sendRequest(b, a).expect(200);
      expect(crossed.body).toMatchObject({
        friendship: 'friends',
        friends: FULL.friends,
      });
      expect(crossed.body).not.toHaveProperty('private');
      for (const u of [a, b]) {
        expect(await requestsOf(u)).toEqual({ incoming: [], outgoing: [] });
      }
      const listA = await http().get('/friends').set(bearer(a)).expect(200);
      expect(listA.body.items.map((f: { id: string }) => f.id)).toEqual([b.id]);
      expect(listA.body.items[0]).toHaveProperty('since');
      expect(listA.body.items[0]).not.toHaveProperty('email');
    });

    it('simultaneous crossed requests end as exactly one friendship', async () => {
      const a = await verifiedUser(t, 'Race');
      const b = await verifiedUser(t, 'Race');
      await Promise.all([sendRequest(a, b), sendRequest(b, a)]);
      expect(
        await t.prisma.friendship.count({
          where: { OR: [{ userAId: a.id }, { userBId: a.id }] },
        }),
      ).toBe(1);
      expect(
        await t.prisma.friendRequest.count({
          where: { OR: [{ requesterId: a.id }, { addresseeId: a.id }] },
        }),
      ).toBe(0);
    });
  });

  describe('accept / decline / cancel / remove', () => {
    async function pending(a: TestUser, b: TestUser): Promise<string> {
      await sendRequest(a, b).expect(200);
      return (await requestsOf(b)).incoming[0].id;
    }

    it('accept and cancel fired together never both succeed', async () => {
      for (let round = 0; round < 5; round++) {
        const a = await verifiedUser(t, 'Racer');
        const b = await verifiedUser(t, 'Racee');
        const id = await pending(a, b);
        const [accepted, cancelled] = await Promise.all([
          http().post(`/friends/requests/${id}/accept`).set(bearer(b)),
          http().delete(`/friends/requests/${id}`).set(bearer(a)),
        ]);
        const friends = await t.prisma.friendship.count({
          where: { OR: [{ userAId: a.id }, { userBId: a.id }] },
        });
        if (accepted.status === 200) {
          expect(cancelled.status).toBe(404);
          expect(friends).toBe(1);
        } else {
          expect(accepted.status).toBe(404);
          expect(cancelled.status).toBe(204);
          expect(friends).toBe(0);
        }
        expect(await t.prisma.friendRequest.count({ where: { id } })).toBe(0);
      }
    });

    it('malformed ids → 404 (USER_NOT_FOUND for a user, NOT_FOUND for a request)', async () => {
      const a = await verifiedUser(t, 'Malformed');
      const user = await http()
        .post('/friends/requests')
        .set(bearer(a))
        .send({ userId: 'nope' })
        .expect(404);
      expect(user.body.code).toBe('USER_NOT_FOUND');
      const accept = await http()
        .post('/friends/requests/nope/accept')
        .set(bearer(a))
        .expect(404);
      expect(accept.body.code).toBe('NOT_FOUND');
      const cancel = await http()
        .delete('/friends/requests/nope')
        .set(bearer(a))
        .expect(404);
      expect(cancel.body.code).toBe('NOT_FOUND');
    });

    it('lists friends by display name and incoming requests newest first', async () => {
      const me = await verifiedUser(t, 'Hub');
      const names = ['Mzz', 'Azz', 'Kzz'];
      const pals: TestUser[] = [];
      for (const n of names) {
        const pal = await verifiedUser(t, n);
        await befriend(pal, me);
        pals.push(pal);
      }
      const older = await verifiedUser(t, 'Older');
      const newer = await verifiedUser(t, 'Newer');
      await sendRequest(older, me).expect(200);
      await new Promise((r) => setTimeout(r, 20));
      await sendRequest(newer, me).expect(200);

      const list = await http().get('/friends').set(bearer(me)).expect(200);
      expect(
        list.body.items.map((f: { displayName: string }) => f.displayName),
      ).toEqual(['Azz', 'Kzz', 'Mzz']);
      const reqs = await requestsOf(me);
      expect(reqs.incoming.map((r) => r.user.id)).toEqual([newer.id, older.id]);
    });

    it('the addressee accepts: friendship created, request gone', async () => {
      const a = await filledUser('Req');
      const b = await verifiedUser(t, 'Acc');
      const id = await pending(a, b);
      const res = await http()
        .post(`/friends/requests/${id}/accept`)
        .set(bearer(b))
        .expect(200);
      expect(res.body).toMatchObject({
        id: a.id,
        friendship: 'friends',
        friends: FULL.friends,
      });
      expect(res.body).not.toHaveProperty('private');
      expect(await requestsOf(a)).toEqual({ incoming: [], outgoing: [] });
      const list = await http().get('/friends').set(bearer(b)).expect(200);
      expect(list.body.items.map((f: { id: string }) => f.id)).toEqual([a.id]);
    });

    it('the addressee declines: request deleted, no friendship', async () => {
      const a = await verifiedUser(t, 'Req');
      const b = await verifiedUser(t, 'Dec');
      const id = await pending(a, b);
      await http()
        .post(`/friends/requests/${id}/decline`)
        .set(bearer(b))
        .expect(204);
      expect(await requestsOf(a)).toEqual({ incoming: [], outgoing: [] });
      expect((await profileOf(a, b).expect(200)).body.friendship).toBe('none');
    });

    it('the requester cancels: request deleted', async () => {
      const a = await verifiedUser(t, 'Can');
      const b = await verifiedUser(t, 'Cel');
      const id = await pending(a, b);
      await http().delete(`/friends/requests/${id}`).set(bearer(a)).expect(204);
      expect(await requestsOf(b)).toEqual({ incoming: [], outgoing: [] });
    });

    it('either friend removes: friendship deleted and friends info disappears', async () => {
      const a = await filledUser('Rem');
      const b = await filledUser('Ove');
      await befriend(a, b);
      expect((await profileOf(b, a).expect(200)).body).toHaveProperty(
        'friends',
      );
      await http().delete(`/friends/${a.id}`).set(bearer(b)).expect(204);
      const after = await profileOf(b, a).expect(200);
      expect(after.body.friendship).toBe('none');
      expectStrangerView(after.body);
      expect(
        (await http().get('/friends').set(bearer(a)).expect(200)).body.items,
      ).toEqual([]);
    });

    it('the wrong party, or nothing pending → 404 NOT_FOUND', async () => {
      const a = await verifiedUser(t, 'Aa');
      const b = await verifiedUser(t, 'Bb');
      const c = await verifiedUser(t, 'Cc');
      const id = await pending(a, b);
      const unknown = '00000000-0000-4000-8000-000000000000';
      const attempts = [
        () => http().post(`/friends/requests/${id}/accept`).set(bearer(a)), // requester can't accept
        () => http().post(`/friends/requests/${id}/accept`).set(bearer(c)),
        () => http().post(`/friends/requests/${id}/decline`).set(bearer(a)),
        () => http().delete(`/friends/requests/${id}`).set(bearer(b)), // addressee can't cancel
        () => http().post(`/friends/requests/${unknown}/accept`).set(bearer(b)),
        () => http().post('/friends/requests/nope/decline').set(bearer(b)),
        () => http().delete(`/friends/requests/${unknown}`).set(bearer(a)),
        () => http().delete(`/friends/${c.id}`).set(bearer(a)), // not friends
        () => http().delete('/friends/nope').set(bearer(a)),
      ];
      for (const attempt of attempts) {
        const res = await attempt().expect(404);
        expect(res.body.code).toBe('NOT_FOUND');
      }
      // The request survived all of that.
      expect((await requestsOf(b)).incoming.map((r) => r.id)).toEqual([id]);
    });
  });

  describe('search: friends first', () => {
    it('lists friends before others and flags them', async () => {
      const prefix = `Zq${Date.now()}`;
      const me = await verifiedUser(t, 'Searcher');
      const others = [];
      for (const n of ['a', 'b', 'c'])
        others.push(await verifiedUser(t, `${prefix}${n}`));
      await befriend(me, others[2]);
      const res = await http()
        .get('/users/search')
        .query({ q: prefix })
        .set(bearer(me))
        .expect(200);
      expect(res.body.items).toEqual([
        { id: others[2].id, displayName: `${prefix}c`, isFriend: true },
        { id: others[0].id, displayName: `${prefix}a`, isFriend: false },
        { id: others[1].id, displayName: `${prefix}b`, isFriend: false },
      ]);
    });
  });

  describe('link Google (FR-3)', () => {
    afterEach(() => {
      t.google.configured = true;
    });

    const link = (user: TestUser, idToken: string) =>
      http().post('/me/google').set(bearer(user)).send({ idToken });

    it('answers 429 RATE_LIMITED on the sixth link attempt within a minute', async () => {
      const me = await verifiedUser(t, 'Spammer');
      for (let i = 0; i < 5; i++) {
        const res = await link(me, 'forged').expect(401);
        expect(res.body.code).toBe('GOOGLE_TOKEN_INVALID');
      }
      const limited = await link(me, 'forged').expect(429);
      expect(limited.body.code).toBe('RATE_LIMITED');
    });

    it('links a valid, unused Google account; Google login then opens this account', async () => {
      const me = await verifiedUser(t, 'Linker');
      const sub = `link-${Date.now()}-${++seq}`;
      const token = `valid|${sub}|other.${sub}@gmail.example|Linker G`;
      const res = await link(me, token).expect(200);
      expect(res.body).toMatchObject({
        id: me.id,
        email: me.email,
        hasGoogle: true,
      });
      // Linking the same account again is a no-op.
      await link(me, token).expect(200);

      const login = await http()
        .post('/auth/google')
        .send({ idToken: token })
        .expect(200);
      expect(login.body.user.id).toBe(me.id);
    });

    it('a Google account linked to another user → 409 GOOGLE_ALREADY_LINKED', async () => {
      const first = await verifiedUser(t, 'First');
      const second = await verifiedUser(t, 'Second');
      const sub = `taken-${Date.now()}-${++seq}`;
      await link(first, `valid|${sub}|${sub}@gmail.example|F`).expect(200);
      const res = await link(
        second,
        `valid|${sub}|${sub}@gmail.example|F`,
      ).expect(409);
      expect(res.body.code).toBe('GOOGLE_ALREADY_LINKED');
    });

    it('an account already linked to a different Google account → 409 (no re-link)', async () => {
      const me = await verifiedUser(t, 'Linked');
      const s1 = `one-${Date.now()}-${++seq}`;
      const s2 = `two-${Date.now()}-${++seq}`;
      await link(me, `valid|${s1}|${s1}@gmail.example|A`).expect(200);
      const res = await link(me, `valid|${s2}|${s2}@gmail.example|A`).expect(
        409,
      );
      expect(res.body.code).toBe('GOOGLE_ALREADY_LINKED');
    });

    it('an invalid token → 401 GOOGLE_TOKEN_INVALID', async () => {
      const me = await verifiedUser(t, 'Forger');
      const res = await link(me, 'forged').expect(401);
      expect(res.body.code).toBe('GOOGLE_TOKEN_INVALID');
      expect(
        (await http().get('/me').set(bearer(me)).expect(200)).body.hasGoogle,
      ).toBe(false);
    });

    it('Google not configured → 503 GOOGLE_NOT_CONFIGURED', async () => {
      t.google.configured = false;
      const me = await verifiedUser(t, 'Unconf');
      const res = await link(me, 'valid|x|x@gmail.example|X').expect(503);
      expect(res.body.code).toBe('GOOGLE_NOT_CONFIGURED');
    });

    it('requires a logged-in user', async () => {
      await http()
        .post('/me/google')
        .send({ idToken: 'valid|a|a@b.c|A' })
        .expect(401);
    });

    it('login with an unlinked Google account matching an email account still says ACCOUNT_EXISTS', async () => {
      const me = await verifiedUser(t, 'Untouched');
      const res = await http()
        .post('/auth/google')
        .send({ idToken: `valid|nolink-${++seq}-${Date.now()}|${me.email}|U` })
        .expect(409);
      expect(res.body.code).toBe('ACCOUNT_EXISTS');
    });
  });

  it('documents every profile, friends and link route in Swagger', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = res.body.paths as Record<string, Record<string, unknown>>;
    const expected: [string, string][] = [
      ['/me/profile', 'get'],
      ['/me/profile', 'patch'],
      ['/users/{id}/profile', 'get'],
      ['/friends', 'get'],
      ['/friends/requests', 'get'],
      ['/friends/requests', 'post'],
      ['/friends/requests/{id}/accept', 'post'],
      ['/friends/requests/{id}/decline', 'post'],
      ['/friends/requests/{id}', 'delete'],
      ['/friends/{userId}', 'delete'],
      ['/me/google', 'post'],
    ];
    for (const [path, method] of expected) {
      expect(paths[path]?.[method]).toBeDefined();
    }
    const schemas = res.body.components.schemas as Record<string, unknown>;
    expect(schemas).toHaveProperty('ProfileView');
    expect(schemas).toHaveProperty('UpdateProfileDto');
  });
});
