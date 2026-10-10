import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import type {
  PlaylistDetail,
  PlaylistPush,
} from '../src/playlists/playlist.view.js';
import { createTestApp, TestApp } from './support/app.js';
import { bearer, TestUser, verifiedUser } from './support/users.js';

/** Covers every row of the I/O & edge-case matrix of spec C (Playlist Editor). */
describe('Playlist Editor (e2e)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());
  const sockets: Socket[] = [];

  // Catalog ids from FakeDeezer: 3135551..3135590.
  const TRACK = (n: number) => String(3135550 + n);

  beforeAll(async () => {
    t = await createTestApp({ listen: true });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await t.logs.flush();
    await t.app.close();
  });

  async function createPlaylist(
    owner: TestUser,
    body: Record<string, unknown> = {},
  ): Promise<PlaylistDetail> {
    const res = await http()
      .post('/playlists')
      .set(bearer(owner))
      .send({ name: 'Road trip', ...body })
      .expect(201);
    return res.body as PlaylistDetail;
  }

  const get = async (user: TestUser, id: string) =>
    (await http().get(`/playlists/${id}`).set(bearer(user)).expect(200))
      .body as PlaylistDetail;

  const add = (
    user: TestUser,
    id: string,
    trackId: string,
    baseVersion: number,
  ) =>
    http()
      .post(`/playlists/${id}/tracks`)
      .set(bearer(user))
      .send({ trackId, baseVersion });

  const move = (
    user: TestUser,
    id: string,
    entryId: string,
    toIndex: number,
    baseVersion: number,
  ) =>
    http()
      .patch(`/playlists/${id}/tracks/${entryId}`)
      .set(bearer(user))
      .send({ toIndex, baseVersion });

  const remove = (
    user: TestUser,
    id: string,
    entryId: string,
    baseVersion: number,
  ) =>
    http()
      .delete(`/playlists/${id}/tracks/${entryId}`)
      .query({ baseVersion })
      .set(bearer(user));

  /** Creates a playlist with tracks 1..n added by the owner; returns the latest detail. */
  async function withTracks(
    owner: TestUser,
    n: number,
    body: Record<string, unknown> = {},
  ): Promise<PlaylistDetail> {
    let detail = await createPlaylist(owner, body);
    for (let i = 1; i <= n; i++)
      detail = (
        await add(owner, detail.playlist.id, TRACK(i), detail.version).expect(
          200,
        )
      ).body;
    return detail;
  }

  const ids = (d: { tracks: { track: { id: string } }[] }) =>
    d.tracks.map((e) => e.track.id);
  const positions = (d: { tracks: { position: number }[] }) =>
    d.tracks.map((e) => e.position);

  function connect(user: TestUser): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(t.url, {
        auth: { token: user.token },
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

  function nextEvent<T>(
    socket: Socket,
    event: string,
    match: (payload: T) => boolean = () => true,
    timeoutMs = 1000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`no ${event} within ${timeoutMs}ms`));
      }, timeoutMs);
      const handler = (payload: T) => {
        if (!match(payload)) return;
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });
  }

  describe('docs', () => {
    it('lists every playlist route with inputs and outputs', async () => {
      const res = await http().get('/docs-json').expect(200);
      const paths = res.body.paths as Record<string, Record<string, any>>;
      const routes: [string, string][] = [
        ['/playlists', 'get'],
        ['/playlists', 'post'],
        ['/playlists/{id}', 'get'],
        ['/playlists/{id}', 'patch'],
        ['/playlists/{id}/invites', 'get'],
        ['/playlists/{id}/invites/{userId}', 'put'],
        ['/playlists/{id}/invites/{userId}', 'delete'],
        ['/playlists/{id}/tracks', 'post'],
        ['/playlists/{id}/tracks/{entryId}', 'patch'],
        ['/playlists/{id}/tracks/{entryId}', 'delete'],
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
      expect(paths['/playlists'].post.requestBody).toBeDefined();
      expect(paths['/playlists/{id}'].patch.requestBody).toBeDefined();
      expect(paths['/playlists/{id}/tracks'].post.requestBody).toBeDefined();
      expect(
        paths['/playlists/{id}/tracks/{entryId}'].patch.requestBody,
      ).toBeDefined();
      expect(
        paths['/playlists/{id}/tracks/{entryId}'].delete.parameters.map(
          (p: any) => p.name,
        ),
      ).toContain('baseVersion');
      expect(
        paths['/playlists/{id}/tracks/{entryId}'].patch.responses['409'],
      ).toBeDefined();
      expect(
        paths['/playlists'].get.parameters.map((p: any) => p.name),
      ).toEqual(expect.arrayContaining(['scope', 'q']));
    });
  });

  describe('create / edit (FR-17, FR-18)', () => {
    it('creates with defaults; the owner can edit settings, others get NOT_OWNER', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const other = await verifiedUser(t, 'Sam');
      const created = await createPlaylist(owner, { name: '  Road trip ☀️ ' });
      expect(created).toMatchObject({
        playlist: {
          name: 'Road trip ☀️',
          description: '',
          owner: { id: owner.id, displayName: 'Yasmine' },
          visibility: 'public',
          license: 'everyone',
        },
        tracks: [],
        version: 1,
        lastEditor: null,
        isOwner: true,
        canEdit: { allowed: true, reason: null },
      });
      const id = created.playlist.id;

      const edited = await http()
        .patch(`/playlists/${id}`)
        .set(bearer(owner))
        .send({ license: 'invited', description: 'Saturday' })
        .expect(200);
      expect(edited.body.playlist).toMatchObject({
        license: 'invited',
        description: 'Saturday',
      });
      expect(edited.body.version).toBe(2);

      const refused = await http()
        .patch(`/playlists/${id}`)
        .set(bearer(other))
        .send({ name: 'Mine now' })
        .expect(403);
      expect(refused.body.code).toBe('NOT_OWNER');

      const bad = await http()
        .post('/playlists')
        .set(bearer(owner))
        .send({ name: 'x', license: 'on_site' })
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_FAILED');
      await http()
        .post('/playlists')
        .set(bearer(owner))
        .send({ name: '   ' })
        .expect(400);
    });

    it('lists mine, shared and discover (public only); discover search covers names', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const tag = `Mix${Date.now()}`;
      const pub = await withTracks(owner, 1, { name: `${tag} public` });
      const priv = await createPlaylist(owner, {
        name: `${tag} private`,
        visibility: 'private',
      });
      await http()
        .put(`/playlists/${priv.playlist.id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);

      const mine = await http()
        .get('/playlists')
        .query({ scope: 'mine' })
        .set(bearer(owner))
        .expect(200);
      expect(mine.body.items.map((p: { id: string }) => p.id)).toEqual(
        expect.arrayContaining([pub.playlist.id, priv.playlist.id]),
      );

      const shared = await http()
        .get('/playlists')
        .query({ scope: 'shared' })
        .set(bearer(sam))
        .expect(200);
      expect(shared.body.items.map((p: { id: string }) => p.id)).toEqual([
        priv.playlist.id,
      ]);
      expect(shared.body.items[0].collaborators).toEqual([
        { id: owner.id, displayName: 'Yasmine' },
        { id: sam.id, displayName: 'Sam' },
      ]);

      const discover = await http()
        .get('/playlists')
        .query({ q: tag.toLowerCase() })
        .set(bearer(sam))
        .expect(200);
      expect(discover.body.items).toHaveLength(1);
      expect(discover.body.items[0]).toMatchObject({
        id: pub.playlist.id,
        trackCount: 1,
        artworkUrl: expect.stringContaining(TRACK(1)),
        visibility: 'public',
      });
    });
  });

  describe('track edits (FR-19, FR-20, AD-3)', () => {
    it('add: appended at the end, version + 1; duplicate → 409; unknown id → 404', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await withTracks(owner, 2);
      const id = d.playlist.id;
      const res = await add(sam, id, TRACK(3), d.version).expect(200);
      expect(ids(res.body)).toEqual([TRACK(1), TRACK(2), TRACK(3)]);
      expect(positions(res.body)).toEqual([0, 1, 2]);
      expect(res.body.version).toBe(d.version + 1);
      expect(res.body.lastEditor).toEqual({ id: sam.id, displayName: 'Sam' });
      expect(res.body.tracks[2]).toMatchObject({
        addedBy: { id: sam.id },
        track: { id: TRACK(3), title: 'Track 3', artist: 'Daft Punk' },
      });

      const dup = await add(owner, id, TRACK(1), res.body.version).expect(409);
      expect(dup.body.code).toBe('TRACK_ALREADY_IN_PLAYLIST');
      const missing = await add(
        owner,
        id,
        '999999999',
        res.body.version,
      ).expect(404);
      expect(missing.body.code).toBe('TRACK_NOT_FOUND');
      const garbage = await add(owner, id, 'abc', res.body.version).expect(400);
      expect(garbage.body.code).toBe('VALIDATION_FAILED');
      await http()
        .post(`/playlists/${id}/tracks`)
        .set(bearer(owner))
        .send({ trackId: TRACK(4) })
        .expect(400);
      expect((await get(owner, id)).version).toBe(res.body.version);
    });

    it('move: the entry lands at toIndex, others shift, positions stay contiguous', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      let d = await withTracks(owner, 5);
      const id = d.playlist.id;
      const e4 = d.tracks[3].id;
      d = (await move(owner, id, e4, 0, d.version).expect(200)).body;
      expect(ids(d)).toEqual([
        TRACK(4),
        TRACK(1),
        TRACK(2),
        TRACK(3),
        TRACK(5),
      ]);
      expect(positions(d)).toEqual([0, 1, 2, 3, 4]);
      d = (await move(owner, id, e4, 4, d.version).expect(200)).body;
      expect(ids(d)).toEqual([
        TRACK(1),
        TRACK(2),
        TRACK(3),
        TRACK(5),
        TRACK(4),
      ]);
      const e1 = d.tracks[0].id;
      d = (await move(owner, id, e1, 2, d.version).expect(200)).body;
      expect(ids(d)).toEqual([
        TRACK(2),
        TRACK(3),
        TRACK(1),
        TRACK(5),
        TRACK(4),
      ]);
      const rows = await t.prisma.playlistTrack.findMany({
        where: { playlistId: id },
        orderBy: { position: 'asc' },
      });
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);

      const out = await move(owner, id, e1, 5, d.version).expect(400);
      expect(out.body.code).toBe('VALIDATION_FAILED');
      await move(owner, id, e1, -1, d.version).expect(400);
      expect((await get(owner, id)).version).toBe(d.version);
    });

    it('remove: positions compacted; unknown entry → 404', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      let d = await withTracks(owner, 4);
      const id = d.playlist.id;
      d = (await remove(owner, id, d.tracks[1].id, d.version).expect(200)).body;
      expect(ids(d)).toEqual([TRACK(1), TRACK(3), TRACK(4)]);
      expect(positions(d)).toEqual([0, 1, 2]);
      const rows = await t.prisma.playlistTrack.findMany({
        where: { playlistId: id },
        orderBy: { position: 'asc' },
      });
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);

      const unknown = await remove(
        owner,
        id,
        '00000000-0000-4000-8000-000000000000',
        d.version,
      ).expect(404);
      expect(unknown.body.code).toBe('NOT_FOUND');
      await http()
        .delete(`/playlists/${id}/tracks/${d.tracks[0].id}`)
        .set(bearer(owner))
        .expect(400);
      // An entry of another playlist is unknown here.
      const other = await withTracks(owner, 1);
      await remove(owner, id, other.tracks[0].id, d.version).expect(404);
    });

    it('stale baseVersion: nothing changes; 409 VERSION_CONFLICT with the current playlist and lastEditor', async () => {
      const yasmine = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await withTracks(yasmine, 3);
      const id = d.playlist.id;
      const stale = d.version;
      const won = (await move(sam, id, d.tracks[2].id, 0, stale).expect(200))
        .body;

      for (const res of [
        await move(yasmine, id, d.tracks[2].id, 1, stale),
        await add(yasmine, id, TRACK(9), stale),
        await remove(yasmine, id, d.tracks[0].id, stale),
      ]) {
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('VERSION_CONFLICT');
        expect(res.body.details.lastEditor).toEqual({
          id: sam.id,
          displayName: 'Sam',
        });
        expect(res.body.details.playlist.version).toBe(won.version);
        expect(ids(res.body.details.playlist)).toEqual(ids(won));
        expect(res.body.details.playlist.playlist.id).toBe(id);
      }
      const after = await get(yasmine, id);
      expect(after.version).toBe(won.version);
      expect(ids(after)).toEqual([TRACK(3), TRACK(1), TRACK(2)]);

      // A future version is just as stale.
      await move(yasmine, id, d.tracks[0].id, 1, won.version + 5).expect(409);
    });

    it('simultaneous moves of the same track on one baseVersion: exactly one 200, same final order for all', async () => {
      const yasmine = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await withTracks(yasmine, 7);
      const id = d.playlist.id;
      const entry = d.tracks[6].id;
      const [a, b] = await Promise.all([
        move(yasmine, id, entry, 0, d.version),
        move(sam, id, entry, 2, d.version),
      ]);
      expect([a.status, b.status].sort((x, y) => x - y)).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      const loser = a.status === 200 ? b : a;
      expect(loser.body.details.playlist.version).toBe(winner.body.version);
      expect(ids(loser.body.details.playlist)).toEqual(ids(winner.body));
      const [g1, g2] = await Promise.all([get(yasmine, id), get(sam, id)]);
      expect(ids(g1)).toEqual(ids(winner.body));
      expect(ids(g2)).toEqual(ids(winner.body));
      expect(positions(g1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
  });

  describe('access (AD-4)', () => {
    it('read-only: a public invited-only playlist opens for anyone, but edits → 403 READ_ONLY', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const guest = await verifiedUser(t, 'Guest');
      const invitee = await verifiedUser(t, 'Sam');
      const d = await withTracks(owner, 2, { license: 'invited' });
      const id = d.playlist.id;
      await http()
        .put(`/playlists/${id}/invites/${invitee.id}`)
        .set(bearer(owner))
        .expect(200);

      const view = await get(guest, id);
      expect(view.canEdit).toEqual({ allowed: false, reason: 'READ_ONLY' });
      expect(view.isOwner).toBe(false);
      expect(ids(view)).toEqual([TRACK(1), TRACK(2)]);

      const v = (await get(owner, id)).version;
      for (const res of [
        await add(guest, id, TRACK(3), v),
        await move(guest, id, d.tracks[0].id, 1, v),
        await remove(guest, id, d.tracks[0].id, v),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('READ_ONLY');
      }

      expect((await get(invitee, id)).canEdit.allowed).toBe(true);
      await add(invitee, id, TRACK(3), v).expect(200);
      // The owner always passes.
      const ov = (await get(owner, id)).version;
      await add(owner, id, TRACK(4), ov).expect(200);
    });

    it('private: 404 to non-invited users, hidden from Discover and search, socket join refused', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const stranger = await verifiedUser(t, 'Stranger');
      const tag = `Secret${Date.now()}`;
      const d = await createPlaylist(owner, {
        name: tag,
        visibility: 'private',
      });
      const id = d.playlist.id;

      const res = await http()
        .get(`/playlists/${id}`)
        .set(bearer(stranger))
        .expect(404);
      expect(res.body).toMatchObject({
        code: 'NOT_FOUND',
        message: "This playlist doesn't exist or is private.",
      });
      expect(
        (await add(stranger, id, TRACK(1), d.version).expect(404)).body.code,
      ).toBe('NOT_FOUND');
      expect(
        (
          await http()
            .get(`/playlists/${id}/invites`)
            .set(bearer(stranger))
            .expect(404)
        ).body.code,
      ).toBe('NOT_FOUND');
      const discover = await http()
        .get('/playlists')
        .query({ scope: 'discover', q: tag })
        .set(bearer(stranger))
        .expect(200);
      expect(discover.body.items).toEqual([]);
      await http()
        .get('/playlists/not-a-uuid')
        .set(bearer(stranger))
        .expect(404);

      const socket = await connect(stranger);
      expect(await join(socket, `playlist:${id}`)).toMatchObject({
        ok: false,
        code: 'NOT_FOUND',
      });
      const ownerSocket = await connect(owner);
      expect(await join(ownerSocket, `playlist:${id}`)).toMatchObject({
        ok: true,
      });
    });

    it('owner-only invites; invitees see a private playlist; unknown users → 404 USER_NOT_FOUND', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await createPlaylist(owner, {
        visibility: 'private',
        license: 'invited',
      });
      const id = d.playlist.id;
      const list = await http()
        .put(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      expect(list.body.items).toEqual([{ id: sam.id, displayName: 'Sam' }]);
      await http()
        .put(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      expect((await get(sam, id)).canEdit.allowed).toBe(true);
      expect(
        (
          await http()
            .get(`/playlists/${id}/invites`)
            .set(bearer(sam))
            .expect(403)
        ).body.code,
      ).toBe('NOT_OWNER');
      expect(
        (
          await http()
            .put(
              `/playlists/${id}/invites/00000000-0000-4000-8000-000000000000`,
            )
            .set(bearer(owner))
            .expect(404)
        ).body.code,
      ).toBe('USER_NOT_FOUND');
      await http()
        .put(`/playlists/${id}/invites/${owner.id}`)
        .set(bearer(owner))
        .expect(400);
      const removed = await http()
        .delete(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      expect(removed.body.items).toEqual([]);
      await http().get(`/playlists/${id}`).set(bearer(sam)).expect(404);
    });
  });

  describe('live (FR-21, AD-1)', () => {
    it('every viewer gets playlist.updated with the full ordered list + version within 1s, and named presence', async () => {
      const yasmine = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await withTracks(yasmine, 2);
      const id = d.playlist.id;
      const roomName = `playlist:${id}`;

      const a = await connect(yasmine);
      expect(await join(a, roomName)).toMatchObject({ ok: true });
      const b = await connect(sam);
      const bothPresent = nextEvent<{ room: string; viewers: unknown[] }>(
        a,
        'presence.updated',
        (p) => p.viewers?.length === 2,
      );
      expect(await join(b, roomName)).toMatchObject({
        ok: true,
        listeners: 2,
      });
      const presence = await bothPresent;
      expect(presence).toMatchObject({ room: roomName, listeners: 2 });
      expect(presence.viewers).toEqual(
        expect.arrayContaining([
          { id: yasmine.id, displayName: 'Yasmine' },
          { id: sam.id, displayName: 'Sam' },
        ]),
      );
      expect((await get(sam, id)).viewers).toHaveLength(2);

      const pushes = Promise.all(
        [a, b].map((s) => nextEvent<PlaylistPush>(s, 'playlist.updated')),
      );
      const moved = (
        await move(sam, id, d.tracks[1].id, 0, d.version).expect(200)
      ).body as PlaylistDetail;
      for (const push of await pushes) {
        expect(push).toMatchObject({
          room: roomName,
          change: 'tracks',
          version: moved.version,
          lastEditor: { id: sam.id, displayName: 'Sam' },
        });
        expect(ids(push)).toEqual([TRACK(2), TRACK(1)]);
        expect(push).not.toHaveProperty('canEdit');
        expect(push).not.toHaveProperty('isOwner');
      }

      const settings = nextEvent<PlaylistPush>(b, 'playlist.updated');
      await http()
        .patch(`/playlists/${id}`)
        .set(bearer(yasmine))
        .send({ license: 'invited' })
        .expect(200);
      expect(await settings).toMatchObject({
        change: 'settings',
        version: moved.version + 1,
        playlist: { license: 'invited' },
      });

      const left = nextEvent<{ viewers: { id: string }[] }>(
        a,
        'presence.updated',
        (p) => p.viewers?.length === 1,
      );
      b.disconnect();
      expect((await left).viewers).toEqual([
        { id: yasmine.id, displayName: 'Yasmine' },
      ]);
    });

    it('an invite pushes change:"invites" with version + 1; a repeated invite does not', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const viewer = await verifiedUser(t, 'Guest');
      const sam = await verifiedUser(t, 'Sam');
      const d = await createPlaylist(owner);
      const id = d.playlist.id;
      const socket = await connect(viewer);
      expect(await join(socket, `playlist:${id}`)).toMatchObject({ ok: true });

      const pushed = nextEvent<PlaylistPush>(socket, 'playlist.updated');
      await http()
        .put(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      expect(await pushed).toMatchObject({
        change: 'invites',
        version: d.version + 1,
        lastEditor: { id: owner.id },
      });

      await http()
        .put(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      expect((await get(owner, id)).version).toBe(d.version + 1);
    });

    it('event rooms keep their presence shape (no names)', async () => {
      const host = await verifiedUser(t, 'Karim');
      const event = await http()
        .post('/events')
        .set(bearer(host))
        .send({ name: 'Party' })
        .expect(201);
      const socket = await connect(host);
      const presence = nextEvent<Record<string, unknown>>(
        socket,
        'presence.updated',
      );
      expect(await join(socket, `event:${event.body.event.id}`)).toMatchObject({
        ok: true,
      });
      const payload = await presence;
      expect(payload).toMatchObject({ listeners: 1 });
      expect(payload).not.toHaveProperty('viewers');
    });

    it('removed invitees and a playlist turning private drop people from the room', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const guest = await verifiedUser(t, 'Guest');
      const d = await createPlaylist(owner);
      const id = d.playlist.id;
      await http()
        .put(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      const s = await connect(sam);
      const g = await connect(guest);
      expect(await join(s, `playlist:${id}`)).toMatchObject({ ok: true });
      expect(await join(g, `playlist:${id}`)).toMatchObject({ ok: true });

      const guestLeft = nextEvent(g, 'room.left');
      await http()
        .patch(`/playlists/${id}`)
        .set(bearer(owner))
        .send({ visibility: 'private' })
        .expect(200);
      await expect(guestLeft).resolves.toMatchObject({
        room: `playlist:${id}`,
      });

      const samLeft = nextEvent(s, 'room.left');
      await http()
        .delete(`/playlists/${id}/invites/${sam.id}`)
        .set(bearer(owner))
        .expect(200);
      await expect(samLeft).resolves.toMatchObject({ room: `playlist:${id}` });
    });
  });

  describe('versioning of non-track changes', () => {
    it('an empty, null or identical PATCH changes nothing (no version bump)', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const d = await createPlaylist(owner, { description: 'Saturday' });
      const id = d.playlist.id;
      for (const body of [
        {},
        { name: null, description: null },
        { name: 'Road trip', description: 'Saturday', license: 'everyone' },
      ]) {
        const res = await http()
          .patch(`/playlists/${id}`)
          .set(bearer(owner))
          .send(body)
          .expect(200);
        expect(res.body.version).toBe(d.version);
        expect(res.body.playlist).toMatchObject({
          name: 'Road trip',
          description: 'Saturday',
        });
      }
    });

    it('a move to the same index is a 200 without a version bump; baseVersion must still match', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const d = await withTracks(owner, 3);
      const id = d.playlist.id;
      const res = await move(owner, id, d.tracks[1].id, 1, d.version).expect(
        200,
      );
      expect(res.body.version).toBe(d.version);
      expect(ids(res.body)).toEqual(ids(d));
      await move(owner, id, d.tracks[1].id, 1, d.version - 1).expect(409);
    });

    it('after a settings PATCH, a stale track edit names the owner as lastEditor', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const sam = await verifiedUser(t, 'Sam');
      const d = await withTracks(owner, 2);
      const id = d.playlist.id;
      // Sam makes the latest track edit…
      const samEdit = (
        await move(sam, id, d.tracks[1].id, 0, d.version).expect(200)
      ).body;
      // …then the owner changes the settings.
      await http()
        .patch(`/playlists/${id}`)
        .set(bearer(owner))
        .send({ name: 'Renamed' })
        .expect(200);
      const stale = await move(
        sam,
        id,
        d.tracks[0].id,
        0,
        samEdit.version,
      ).expect(409);
      expect(stale.body.details.lastEditor).toEqual({
        id: owner.id,
        displayName: 'Yasmine',
      });
      expect(stale.body.details.playlist.version).toBe(samEdit.version + 1);
    });
  });

  describe('pagination', () => {
    it('returns 20 items + nextCursor, then the rest without overlap', async () => {
      const owner = await verifiedUser(t, 'Yasmine');
      const tag = `Page${Date.now()}`;
      for (let i = 0; i < 21; i++)
        await createPlaylist(owner, { name: `${tag} ${i}` });
      const first = await http()
        .get('/playlists')
        .query({ scope: 'mine', q: tag })
        .set(bearer(owner))
        .expect(200);
      expect(first.body.items).toHaveLength(20);
      expect(first.body.nextCursor).toEqual(expect.any(String));
      const second = await http()
        .get('/playlists')
        .query({ scope: 'mine', q: tag, cursor: first.body.nextCursor })
        .set(bearer(owner))
        .expect(200);
      expect(second.body.items).toHaveLength(1);
      expect(second.body).not.toHaveProperty('nextCursor');
      const all = [...first.body.items, ...second.body.items].map(
        (p: { id: string }) => p.id,
      );
      expect(new Set(all).size).toBe(21);
    });
  });

  it('writes one ActionLog row per playlist request', async () => {
    const owner = await verifiedUser(t, 'Yasmine');
    const d = await createPlaylist(owner);
    await get(owner, d.playlist.id);
    await t.logs.flush();
    const rows = await t.prisma.actionLog.findMany({
      where: { userId: owner.id, route: { startsWith: '/playlists' } },
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
