import request from 'supertest';
import { createTestApp, TestApp } from '../support/app.js';
import { bearer, TestUser, verifiedUser } from '../support/users.js';

/** AD-3 / NFR-14 / SM-2: N parallel edits on one baseVersion → exactly one wins, no corruption. */
describe('Playlist edit concurrency (e2e)', () => {
  const N = 20;
  const TRACKS = 10;
  let t: TestApp;
  let owner: TestUser;
  let editors: TestUser[];
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    owner = await verifiedUser(t, 'Owner');
    editors = [];
    for (let i = 0; i < N; i++)
      editors.push(await verifiedUser(t, `Editor${i}`));
  });

  afterAll(async () => {
    await t.logs.flush();
    await t.app.close();
  });

  async function newPlaylist(): Promise<{
    id: string;
    version: number;
    entries: string[];
  }> {
    let res = await http()
      .post('/playlists')
      .set(bearer(owner))
      .send({ name: 'Concurrency' })
      .expect(201);
    const id = res.body.playlist.id as string;
    for (let i = 1; i <= TRACKS; i++)
      res = await http()
        .post(`/playlists/${id}/tracks`)
        .set(bearer(owner))
        .send({ trackId: String(3135550 + i), baseVersion: res.body.version })
        .expect(200);
    return {
      id,
      version: res.body.version,
      entries: res.body.tracks.map((e: { id: string }) => e.id),
    };
  }

  const order = async (user: TestUser, id: string) => {
    const body = (
      await http().get(`/playlists/${id}`).set(bearer(user)).expect(200)
    ).body;
    return {
      version: body.version as number,
      ids: body.tracks.map((e: { id: string }) => e.id) as string[],
      positions: body.tracks.map((e: { position: number }) => e.position),
    };
  };

  async function assertConsistent(id: string, expectedLength: number) {
    const views = await Promise.all(
      [owner, ...editors.slice(0, 3)].map((u) => order(u, id)),
    );
    for (const v of views) {
      expect(v.ids).toEqual(views[0].ids);
      expect(v.version).toBe(views[0].version);
    }
    expect(views[0].positions).toEqual(
      Array.from({ length: expectedLength }, (_, i) => i),
    );
    const rows = await t.prisma.playlistTrack.findMany({
      where: { playlistId: id },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => r.position)).toEqual(
      Array.from({ length: expectedLength }, (_, i) => i),
    );
    return views[0];
  }

  it(`${N} users moving the same track at once on one baseVersion → exactly one 200`, async () => {
    const { id, version, entries } = await newPlaylist();
    const entry = entries[TRACKS - 1];
    const results = await Promise.all(
      editors.map((u, i) =>
        http()
          .patch(`/playlists/${id}/tracks/${entry}`)
          .set(bearer(u))
          .send({ toIndex: i % (TRACKS - 1), baseVersion: version }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
    const winner = results.find((r) => r.status === 200)!;
    for (const loser of results.filter((r) => r.status === 409)) {
      expect(loser.body.code).toBe('VERSION_CONFLICT');
      expect(loser.body.details.playlist.version).toBe(winner.body.version);
    }
    const final = await assertConsistent(id, TRACKS);
    expect(final.version).toBe(version + 1);
    expect(final.ids).toEqual(
      winner.body.tracks.map((e: { id: string }) => e.id),
    );
    expect([...final.ids].sort()).toEqual([...entries].sort());
  });

  it(`${N} mixed adds / moves / removes on one baseVersion → exactly one applied`, async () => {
    const { id, version, entries } = await newPlaylist();
    const results = await Promise.all(
      editors.map((u, i) => {
        const req = http();
        switch (i % 3) {
          case 0:
            return req
              .post(`/playlists/${id}/tracks`)
              .set(bearer(u))
              .send({ trackId: String(3135570 + i), baseVersion: version });
          case 1:
            return req
              .patch(`/playlists/${id}/tracks/${entries[i % TRACKS]}`)
              .set(bearer(u))
              .send({ toIndex: 0, baseVersion: version });
          default:
            return req
              .delete(`/playlists/${id}/tracks/${entries[i % TRACKS]}`)
              .query({ baseVersion: version })
              .set(bearer(u));
        }
      }),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
    const winner = results.find((r) => r.status === 200)!;
    const final = await assertConsistent(id, winner.body.tracks.length);
    expect(final.version).toBe(version + 1);
  });

  it('editors retrying with the version from their 409 all land eventually, positions contiguous', async () => {
    const { id, version, entries } = await newPlaylist();
    const editorsHere = editors.slice(0, 8);
    let accepted = 0;
    let bumped = 0; // a move onto its current index is accepted without a version bump
    await Promise.all(
      editorsHere.map(async (u, i) => {
        let base = version;
        for (let attempt = 0; attempt < 50; attempt++) {
          const res = await http()
            .patch(`/playlists/${id}/tracks/${entries[i]}`)
            .set(bearer(u))
            .send({ toIndex: (i * 3) % TRACKS, baseVersion: base });
          if (res.status === 200) {
            accepted++;
            if (res.body.version === base + 1) bumped++;
            return;
          }
          expect(res.status).toBe(409);
          base = res.body.details.playlist.version;
        }
        throw new Error('never accepted');
      }),
    );
    expect(accepted).toBe(editorsHere.length);
    const final = await assertConsistent(id, TRACKS);
    expect(final.version).toBe(version + bumped);
    expect(bumped).toBeGreaterThan(0);
  });
});
