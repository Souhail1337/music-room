import request from 'supertest';
import { createTestApp, TestApp } from '../support/app.js';
import { bearer, TestUser, verifiedUser } from '../support/users.js';

/** AD-2 / NFR-14: N parallel requests must count exactly N, never more, never less. */
describe('Vote concurrency (e2e)', () => {
  const N = 20;
  let t: TestApp;
  let host: TestUser;
  let voters: TestUser[];
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
    host = await verifiedUser(t, 'Host');
    voters = [];
    for (let i = 0; i < N; i++) voters.push(await verifiedUser(t, `Voter${i}`));
  });

  afterAll(async () => {
    await t.logs.flush();
    await t.app.close();
  });

  async function newEvent(): Promise<string> {
    const res = await http()
      .post('/events')
      .set(bearer(host))
      .send({ name: 'Concurrency' })
      .expect(201);
    return res.body.event.id;
  }

  it(`${N} users voting the same suggestion at once → voteCount rises by exactly ${N}`, async () => {
    const id = await newEvent();
    const sid = (
      await http()
        .post(`/events/${id}/suggestions`)
        .set(bearer(host))
        .send({ trackId: '3135551' })
        .expect(200)
    ).body.queue[0].id;
    const before = (
      await http().get(`/events/${id}`).set(bearer(host)).expect(200)
    ).body;

    const results = await Promise.all(
      voters.map((v) =>
        http()
          .put(`/events/${id}/suggestions/${sid}/vote`)
          .set(bearer(v))
          .send({}),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(N).fill(200));

    const after = (
      await http().get(`/events/${id}`).set(bearer(host)).expect(200)
    ).body;
    expect(after.queue[0].voteCount).toBe(1 + N);
    expect(after.version).toBe(before.version + N);
    expect(await t.prisma.vote.count({ where: { suggestionId: sid } })).toBe(
      1 + N,
    );
  });

  it(`${N} users suggesting the same new track at once → one suggestion with ${N} votes`, async () => {
    const id = await newEvent();
    const results = await Promise.all(
      voters.map((v) =>
        http()
          .post(`/events/${id}/suggestions`)
          .set(bearer(v))
          .send({ trackId: '3135552' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(N).fill(200));
    const after = (
      await http().get(`/events/${id}`).set(bearer(host)).expect(200)
    ).body;
    expect(after.queue).toHaveLength(1);
    expect(after.queue[0].voteCount).toBe(N);
  });

  it('parallel vote + unvote storms leave the count equal to the rows', async () => {
    const id = await newEvent();
    const sid = (
      await http()
        .post(`/events/${id}/suggestions`)
        .set(bearer(host))
        .send({ trackId: '3135553' })
        .expect(200)
    ).body.queue[0].id;
    const path = `/events/${id}/suggestions/${sid}/vote`;
    await Promise.all(
      voters.flatMap((v, i) => [
        http().put(path).set(bearer(v)).send({}),
        http().put(path).set(bearer(v)).send({}),
        ...(i % 2 ? [http().delete(path).set(bearer(v))] : []),
      ]),
    );
    const after = (
      await http().get(`/events/${id}`).set(bearer(host)).expect(200)
    ).body;
    const rows = await t.prisma.vote.count({ where: { suggestionId: sid } });
    expect(after.queue[0].voteCount).toBe(rows);
    expect(rows).toBeGreaterThanOrEqual(1 + N / 2);
    expect(rows).toBeLessThanOrEqual(1 + N);
  });
});
