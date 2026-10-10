import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { createTestApp, TestApp } from './support/app.js';
import { bearer, TestUser, verifiedUser } from './support/users.js';

/** Covers every row of the I/O & edge-case matrix of spec B (Track Vote). */
describe('Track Vote (e2e)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const sockets: Socket[] = [];

  // Catalog ids from FakeDeezer: 3135551..3135590 ("One More Time" is 3135556).
  const TRACK = (n: number) => String(3135550 + n);
  const PARIS = { lat: 48.8566, lng: 2.3522 };

  beforeAll(async () => {
    t = await createTestApp({ listen: true });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await t.logs.flush();
    await t.app.close();
  });

  async function createEvent(
    host: TestUser,
    body: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/events')
      .set(bearer(host))
      .send({ name: 'Party', ...body })
      .expect(201);
    return res.body as EventDetail;
  }

  function suggest(
    user: TestUser,
    eventId: string,
    trackId: string,
    extra: Record<string, unknown> = {},
  ) {
    return http()
      .post(`/events/${eventId}/suggestions`)
      .set(bearer(user))
      .send({ trackId, ...extra });
  }

  function connect(user: TestUser | null): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(t.url, {
        auth: user ? { token: user.token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', (error) => reject(error));
    });
  }

  function join(
    socket: Socket,
    room: string,
  ): Promise<{ ok: boolean; code?: string; listeners?: number }> {
    return socket.timeout(2000).emitWithAck('join', { room });
  }

  function nextPush(socket: Socket, timeoutMs = 1000): Promise<QueuePush> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('no push within 1s')),
        timeoutMs,
      );
      socket.once('queue.updated', (payload: QueuePush) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });
  }

  describe('docs', () => {
    it('lists every music, event and user-search route with inputs and outputs', async () => {
      const res = await http().get('/docs-json').expect(200);
      const paths = res.body.paths as Record<string, Record<string, any>>;
      const routes: [string, string][] = [
        ['/music/search', 'get'],
        ['/music/tracks/{id}/preview', 'get'],
        ['/events', 'get'],
        ['/events', 'post'],
        ['/events/{id}', 'get'],
        ['/events/{id}', 'patch'],
        ['/events/{id}/invites', 'get'],
        ['/events/{id}/invites/{userId}', 'put'],
        ['/events/{id}/invites/{userId}', 'delete'],
        ['/events/{id}/suggestions', 'post'],
        ['/events/{id}/suggestions/{sid}/vote', 'put'],
        ['/events/{id}/suggestions/{sid}/vote', 'delete'],
        ['/events/{id}/advance', 'post'],
        ['/users/search', 'get'],
      ];
      for (const [path, method] of routes) {
        const op = paths[path]?.[method];
        expect(op, `${method.toUpperCase()} ${path}`).toBeDefined();
        const ok = op.responses['200'] ?? op.responses['201'];
        expect(
          ok?.content,
          `${method.toUpperCase()} ${path} output`,
        ).toBeDefined();
      }
      expect(paths['/events'].post.requestBody).toBeDefined();
      expect(paths['/events/{id}/suggestions'].post.requestBody).toBeDefined();
      expect(paths['/events/{id}/advance'].post.requestBody).toBeDefined();
      expect(
        paths['/music/search'].get.parameters.map((p: any) => p.name),
      ).toContain('q');
    });
  });

  describe('music', () => {
    it('searches ≤ 25 tracks and serves the same q from the cache', async () => {
      const user = await verifiedUser(t, 'Searcher');
      const before = t.deezer.searchCalls;
      const res = await http()
        .get('/music/search')
        .query({ q: 'daft punk' })
        .set(bearer(user))
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.length).toBeLessThanOrEqual(25);
      expect(Object.keys(res.body.items[0]).sort()).toEqual(
        ['artist', 'artworkUrl', 'durationSec', 'id', 'title'].sort(),
      );
      await http()
        .get('/music/search')
        .query({ q: 'Daft Punk ' })
        .set(bearer(user))
        .expect(200);
      expect(t.deezer.searchCalls).toBe(before + 1);
    });

    it('answers 503 MUSIC_UNAVAILABLE when Deezer is down', async () => {
      const user = await verifiedUser(t, 'Searcher');
      t.deezer.down = true;
      try {
        const res = await http()
          .get('/music/search')
          .query({ q: 'justice' })
          .set(bearer(user))
          .expect(503);
        expect(res.body.code).toBe('MUSIC_UNAVAILABLE');
      } finally {
        t.deezer.down = false;
      }
    });

    it('fetches a fresh preview URL every time and never stores it', async () => {
      const user = await verifiedUser(t, 'Host');
      const a = await http()
        .get(`/music/tracks/${TRACK(1)}/preview`)
        .set(bearer(user))
        .expect(200);
      const b = await http()
        .get(`/music/tracks/${TRACK(1)}/preview`)
        .set(bearer(user))
        .expect(200);
      expect(a.body.previewUrl).not.toBe(b.body.previewUrl);
      await http().get('/music/tracks/1/preview').set(bearer(user)).expect(404);
    });

    it('needs a verified login', async () => {
      await http().get('/music/search').query({ q: 'x' }).expect(401);
    });
  });

  describe('create and edit', () => {
    it('creates a public "everyone" event with the caller as host', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host, { name: "Karim's 25th" });
      expect(event).toMatchObject({
        event: {
          name: "Karim's 25th",
          visibility: 'public',
          license: 'everyone',
          host: { id: host.id },
        },
        nowPlaying: null,
        queue: [],
        isHost: true,
        canAct: { allowed: true, reason: null },
        myVotes: [],
      });
      expect(event.version).toBeGreaterThanOrEqual(1);
    });

    it('requires venue, radius and window for on-site', async () => {
      const host = await verifiedUser(t, 'Karim');
      const res = await http()
        .post('/events')
        .set(bearer(host))
        .send({ name: 'Party', license: 'on_site' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(res.body.details.fields)).toEqual(
        expect.arrayContaining(['lat', 'radiusM', 'startsAt', 'endsAt']),
      );
    });

    it('only the host edits (403 NOT_HOST)', async () => {
      const host = await verifiedUser(t, 'Karim');
      const other = await verifiedUser(t, 'Sam');
      const event = await createEvent(host);
      const res = await http()
        .patch(`/events/${event.event.id}`)
        .set(bearer(other))
        .send({ name: 'Mine' })
        .expect(403);
      expect(res.body.code).toBe('NOT_HOST');
      const ok = await http()
        .patch(`/events/${event.event.id}`)
        .set(bearer(host))
        .send({ name: 'Renamed', license: 'invited' })
        .expect(200);
      expect(ok.body.event).toMatchObject({
        name: 'Renamed',
        license: 'invited',
      });
      expect(ok.body.version).toBeGreaterThan(event.version);
    });

    it('lists events by scope: hosting, invited, joined, discover (+ search)', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const tag = `Scoped${Date.now()}`;
      const pub = await createEvent(host, { name: `${tag} public` });
      const priv = await createEvent(host, {
        name: `${tag} private`,
        visibility: 'private',
      });
      await http()
        .put(`/events/${priv.event.id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      await suggest(guest, pub.event.id, TRACK(2)).expect(200);

      const ids = async (user: TestUser, scope: string) =>
        (
          await http()
            .get('/events')
            .query({ scope, q: tag })
            .set(bearer(user))
            .expect(200)
        ).body.items.map((e: { id: string }) => e.id);
      expect(await ids(host, 'hosting')).toEqual(
        expect.arrayContaining([pub.event.id, priv.event.id]),
      );
      expect(await ids(guest, 'invited')).toEqual([priv.event.id]);
      expect(await ids(guest, 'joined')).toEqual([pub.event.id]);
      expect(await ids(guest, 'discover')).toEqual([pub.event.id]);
    });
  });

  describe('suggest and vote', () => {
    it('a new track joins with 1 vote (the suggester); data comes from Deezer', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host);
      const res = await suggest(host, event.event.id, TRACK(6)).expect(200);
      expect(res.body.queue).toHaveLength(1);
      expect(res.body.queue[0]).toMatchObject({
        voteCount: 1,
        track: { id: TRACK(6), title: 'One More Time', artist: 'Justice' },
        suggestedBy: { id: host.id },
      });
      expect(res.body.myVotes).toEqual([res.body.queue[0].id]);
    });

    it('rejects unknown Deezer ids with 404 TRACK_NOT_FOUND', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host);
      const res = await suggest(host, event.event.id, '999999').expect(404);
      expect(res.body.code).toBe('TRACK_NOT_FOUND');
    });

    it('rejects client-sent titles (unknown fields)', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host);
      await suggest(host, event.event.id, TRACK(1), { title: 'Fake' }).expect(
        400,
      );
    });

    it('suggesting a queued track becomes a vote, never a duplicate (idempotent)', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const event = await createEvent(host);
      await suggest(host, event.event.id, TRACK(3)).expect(200);
      const second = await suggest(guest, event.event.id, TRACK(3)).expect(200);
      expect(second.body.queue).toHaveLength(1);
      expect(second.body.queue[0].voteCount).toBe(2);
      const again = await suggest(guest, event.event.id, TRACK(3)).expect(200);
      expect(again.body.queue[0].voteCount).toBe(2);
      expect(again.body.version).toBe(second.body.version);
    });

    it('double votes / unvotes change the count by at most 1', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const event = await createEvent(host);
      const sid = (await suggest(host, event.event.id, TRACK(4)).expect(200))
        .body.queue[0].id;
      const path = `/events/${event.event.id}/suggestions/${sid}/vote`;

      await Promise.all(
        Array.from({ length: 6 }, () =>
          http().put(path).set(bearer(guest)).send({}).expect(200),
        ),
      );
      let state = (
        await http()
          .get(`/events/${event.event.id}`)
          .set(bearer(guest))
          .expect(200)
      ).body;
      expect(state.queue[0].voteCount).toBe(2);
      expect(state.myVotes).toEqual([sid]);

      await Promise.all(
        Array.from({ length: 6 }, () =>
          http().delete(path).set(bearer(guest)).expect(200),
        ),
      );
      state = (
        await http()
          .get(`/events/${event.event.id}`)
          .set(bearer(guest))
          .expect(200)
      ).body;
      expect(state.queue[0].voteCount).toBe(1);
      expect(state.myVotes).toEqual([]);
    });

    it('ranks by votes DESC, then earliest suggested first', async () => {
      const host = await verifiedUser(t, 'Karim');
      const a = await verifiedUser(t, 'A');
      const event = await createEvent(host);
      const id = event.event.id;
      await suggest(host, id, TRACK(10)).expect(200); // 1 vote, oldest
      await suggest(host, id, TRACK(11)).expect(200); // 1 vote
      const res = await suggest(a, id, TRACK(11)).expect(200); // 2 votes
      expect(
        res.body.queue.map((s: { track: { id: string } }) => s.track.id),
      ).toEqual([TRACK(11), TRACK(10)]);
      await suggest(host, id, TRACK(12)).expect(200);
      const tie = await suggest(a, id, TRACK(10)).expect(200); // 10 now ties 11 at 2 votes, and is older
      expect(
        tie.body.queue.map((s: { track: { id: string } }) => s.track.id),
      ).toEqual([TRACK(10), TRACK(11), TRACK(12)]);
    });

    it('unknown suggestion → 404', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host);
      await http()
        .put(
          `/events/${event.event.id}/suggestions/00000000-0000-4000-8000-000000000000/vote`,
        )
        .set(bearer(host))
        .send({})
        .expect(404);
    });
  });

  describe('licenses', () => {
    it('invited-only: non-invited users get 403 NOT_INVITED and canAct says why', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Cousin');
      const event = await createEvent(host, { license: 'invited' });
      const sid = (await suggest(host, event.event.id, TRACK(1)).expect(200))
        .body.queue[0].id;

      const view = await http()
        .get(`/events/${event.event.id}`)
        .set(bearer(guest))
        .expect(200);
      expect(view.body.canAct).toEqual({
        allowed: false,
        reason: 'NOT_INVITED',
      });
      expect(
        (await suggest(guest, event.event.id, TRACK(2)).expect(403)).body.code,
      ).toBe('NOT_INVITED');
      const vote = await http()
        .put(`/events/${event.event.id}/suggestions/${sid}/vote`)
        .set(bearer(guest))
        .send({})
        .expect(403);
      expect(vote.body.code).toBe('NOT_INVITED');

      await http()
        .put(`/events/${event.event.id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      await http()
        .put(`/events/${event.event.id}/suggestions/${sid}/vote`)
        .set(bearer(guest))
        .send({})
        .expect(200);
    });

    it('on-site: OUTSIDE_AREA / LOCATION_REQUIRED / OUTSIDE_TIME_WINDOW, allowed at the venue', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const now = Date.now();
      const open = await createEvent(host, {
        license: 'on_site',
        ...PARIS,
        radiusM: 100,
        startsAt: new Date(now - 3_600_000).toISOString(),
        endsAt: new Date(now + 3_600_000).toISOString(),
      });
      const id = open.event.id;

      const far = await suggest(guest, id, TRACK(1), {
        lat: 48.8666,
        lng: 2.3522,
      }).expect(403);
      expect(far.body.code).toBe('OUTSIDE_AREA');
      const none = await suggest(guest, id, TRACK(1)).expect(400);
      expect(none.body.code).toBe('LOCATION_REQUIRED');
      await suggest(guest, id, TRACK(1), { lat: 48.857, lng: 2.3525 }).expect(
        200,
      );
      const view = await http()
        .get(`/events/${id}`)
        .query({ lat: 48.857, lng: 2.3525 })
        .set(bearer(guest))
        .expect(200);
      expect(view.body.canAct.allowed).toBe(true);
      // The host always passes.
      await suggest(host, id, TRACK(2)).expect(200);

      const later = await createEvent(host, {
        license: 'on_site',
        ...PARIS,
        radiusM: 100,
        startsAt: new Date(now + 3_600_000).toISOString(),
        endsAt: new Date(now + 7_200_000).toISOString(),
      });
      const closed = await suggest(
        guest,
        later.event.id,
        TRACK(1),
        PARIS,
      ).expect(403);
      expect(closed.body.code).toBe('OUTSIDE_TIME_WINDOW');
      expect(closed.body.details).toMatchObject({
        startsAt: expect.any(String),
        endsAt: expect.any(String),
      });
    });

    it('private: 404 to non-invited users, hidden from Discover and search, socket join refused', async () => {
      const host = await verifiedUser(t, 'Karim');
      const stranger = await verifiedUser(t, 'Stranger');
      const tag = `Secret${Date.now()}`;
      const event = await createEvent(host, {
        name: tag,
        visibility: 'private',
      });
      const id = event.event.id;

      const res = await http()
        .get(`/events/${id}`)
        .set(bearer(stranger))
        .expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(
        (await suggest(stranger, id, TRACK(1)).expect(404)).body.code,
      ).toBe('NOT_FOUND');
      const discover = await http()
        .get('/events')
        .query({ scope: 'discover', q: tag })
        .set(bearer(stranger))
        .expect(200);
      expect(discover.body.items).toEqual([]);

      const socket = await connect(stranger);
      expect(await join(socket, `event:${id}`)).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
      });
      const hostSocket = await connect(host);
      expect(await join(hostSocket, `event:${id}`)).toMatchObject({ ok: true });
    });
  });

  describe('advance (host only, AD-9)', () => {
    it('promotes the top suggestion; a stale expectedNowPlayingId changes nothing', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const event = await createEvent(host);
      const id = event.event.id;
      await suggest(host, id, TRACK(20)).expect(200);
      await suggest(host, id, TRACK(21)).expect(200);
      await suggest(guest, id, TRACK(21)).expect(200);

      const notHost = await http()
        .post(`/events/${id}/advance`)
        .set(bearer(guest))
        .send({ expectedNowPlayingId: null })
        .expect(403);
      expect(notHost.body.code).toBe('NOT_HOST');

      const first = await http()
        .post(`/events/${id}/advance`)
        .set(bearer(host))
        .send({ expectedNowPlayingId: null })
        .expect(200);
      expect(first.body.nowPlaying.track.id).toBe(TRACK(21));
      expect(
        first.body.queue.map((s: { track: { id: string } }) => s.track.id),
      ).toEqual([TRACK(20)]);

      const stale = await http()
        .post(`/events/${id}/advance`)
        .set(bearer(host))
        .send({ expectedNowPlayingId: null })
        .expect(200);
      expect(stale.body.nowPlaying.track.id).toBe(TRACK(21));
      expect(stale.body.version).toBe(first.body.version);

      // Two host devices racing with the same expectation: exactly one advance happens.
      await suggest(host, id, TRACK(22)).expect(200);
      const race = await Promise.all(
        [1, 2].map(() =>
          http()
            .post(`/events/${id}/advance`)
            .set(bearer(host))
            .send({ expectedNowPlayingId: TRACK(21) })
            .expect(200),
        ),
      );
      const final = (
        await http().get(`/events/${id}`).set(bearer(host)).expect(200)
      ).body;
      expect(final.nowPlaying.track.id).toBe(TRACK(20));
      expect(
        final.queue.map((s: { track: { id: string } }) => s.track.id),
      ).toEqual([TRACK(22)]);
      expect(race.map((r) => r.body.nowPlaying.track.id)).toEqual([
        TRACK(20),
        TRACK(20),
      ]);
    });

    it('requires expectedNowPlayingId', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await createEvent(host);
      await http()
        .post(`/events/${event.event.id}/advance`)
        .set(bearer(host))
        .send({})
        .expect(400);
    });

    it('marks the event LIVE in Discover once something plays', async () => {
      const host = await verifiedUser(t, 'Karim');
      const tag = `Live${Date.now()}`;
      const event = await createEvent(host, { name: tag });
      await suggest(host, event.event.id, TRACK(1)).expect(200);
      await http()
        .post(`/events/${event.event.id}/advance`)
        .set(bearer(host))
        .send({ expectedNowPlayingId: null })
        .expect(200);
      const list = await http()
        .get('/events')
        .query({ q: tag })
        .set(bearer(host))
        .expect(200);
      expect(list.body.items[0]).toMatchObject({
        live: true,
        nowPlaying: { id: TRACK(1) },
      });
    });
  });

  describe('live push (AD-1)', () => {
    it('refuses sockets without a valid token', async () => {
      await expect(connect(null)).rejects.toMatchObject({
        message: 'UNAUTHORIZED',
      });
    });

    it('every viewer gets queue.updated with the full state and a higher version within 1s', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Yasmine');
      const event = await createEvent(host);
      const id = event.event.id;
      const sid = (await suggest(host, id, TRACK(30)).expect(200)).body.queue[0]
        .id;

      const a = await connect(host);
      const b = await connect(guest);
      expect(await join(a, `event:${id}`)).toMatchObject({ ok: true });
      expect(await join(b, `event:${id}`)).toMatchObject({
        ok: true,
        listeners: 2,
      });

      const before = (
        await http().get(`/events/${id}`).set(bearer(guest)).expect(200)
      ).body as EventDetail;
      expect(before.listeners).toBe(2);
      const pushes = Promise.all([nextPush(a), nextPush(b)]);
      await http()
        .put(`/events/${id}/suggestions/${sid}/vote`)
        .set(bearer(guest))
        .send({})
        .expect(200);
      const [pa, pb] = await pushes;
      for (const push of [pa, pb]) {
        expect(push.version).toBeGreaterThan(before.version);
        expect(push.change).toBe('queue');
        expect(push.queue[0]).toMatchObject({ id: sid, voteCount: 2 });
        expect(push.event.id).toBe(id);
        expect(push).not.toHaveProperty('myVotes');
        expect(push).not.toHaveProperty('canAct');
      }

      const advanced = nextPush(b);
      await http()
        .post(`/events/${id}/advance`)
        .set(bearer(host))
        .send({ expectedNowPlayingId: null })
        .expect(200);
      const push = await advanced;
      expect(push.change).toBe('nowPlaying');
      expect(push.nowPlaying?.track.id).toBe(TRACK(30));
      expect(push.version).toBeGreaterThan(pa.version);
    });

    it('removed invitees are dropped from a private room', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Sam');
      const event = await createEvent(host, { visibility: 'private' });
      const id = event.event.id;
      await http()
        .put(`/events/${id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      const socket = await connect(guest);
      expect(await join(socket, `event:${id}`)).toMatchObject({ ok: true });
      const left = new Promise((resolve) => socket.once('room.left', resolve));
      await http()
        .delete(`/events/${id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      await expect(left).resolves.toMatchObject({ room: `event:${id}` });
    });
  });

  describe('invites + user search (FR-11)', () => {
    it('searches by display-name prefix or exact email; returns only id and name; never the caller', async () => {
      const me = await verifiedUser(t, 'Zelda');
      const other = await verifiedUser(t, 'Zeldaish');
      const byName = await http()
        .get('/users/search')
        .query({ q: 'zeld' })
        .set(bearer(me))
        .expect(200);
      const ids = byName.body.items.map((u: { id: string }) => u.id);
      expect(ids).toContain(other.id);
      expect(ids).not.toContain(me.id);
      for (const item of byName.body.items)
        expect(Object.keys(item).sort()).toEqual(['displayName', 'id']);
      const byEmail = await http()
        .get('/users/search')
        .query({ q: other.email.toUpperCase() })
        .set(bearer(me))
        .expect(200);
      expect(byEmail.body.items.map((u: { id: string }) => u.id)).toEqual([
        other.id,
      ]);
      const partialEmail = await http()
        .get('/users/search')
        .query({ q: other.email.slice(0, 8) + 'x' })
        .set(bearer(me))
        .expect(200);
      expect(
        partialEmail.body.items.map((u: { id: string }) => u.id),
      ).not.toContain(other.id);
      expect(
        (
          await http()
            .get('/users/search')
            .query({ q: 'z' })
            .set(bearer(me))
            .expect(400)
        ).body.code,
      ).toBe('VALIDATION_FAILED');
    });

    it('host-only invite management; unknown users → 404 USER_NOT_FOUND', async () => {
      const host = await verifiedUser(t, 'Karim');
      const guest = await verifiedUser(t, 'Sam');
      const event = await createEvent(host);
      const id = event.event.id;
      const list = await http()
        .put(`/events/${id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      expect(list.body.items).toEqual([{ id: guest.id, displayName: 'Sam' }]);
      await http()
        .put(`/events/${id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      expect(
        (
          await http()
            .get(`/events/${id}/invites`)
            .set(bearer(guest))
            .expect(403)
        ).body.code,
      ).toBe('NOT_HOST');
      const missing = await http()
        .put(`/events/${id}/invites/00000000-0000-4000-8000-000000000000`)
        .set(bearer(host))
        .expect(404);
      expect(missing.body.code).toBe('USER_NOT_FOUND');
      const removed = await http()
        .delete(`/events/${id}/invites/${guest.id}`)
        .set(bearer(host))
        .expect(200);
      expect(removed.body.items).toEqual([]);
    });
  });
});

interface Track {
  id: string;
  title: string;
}
interface EventDetail {
  event: { id: string; name: string };
  nowPlaying: { track: Track; startedAt: string } | null;
  queue: { id: string; voteCount: number; track: Track }[];
  version: number;
  listeners: number;
  myVotes: string[];
}
type QueuePush = Omit<EventDetail, 'myVotes'> & { change: string };
