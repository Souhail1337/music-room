# Load test results — Music Room

This page covers NFR-11 and NFR-12. It records a measured, repeatable load test of every service running at once, and the maximum number of simultaneous users those measurements support.

- **Script:** [`loadtest/music-room.js`](../loadtest/music-room.js). Method details are in [`loadtest/README.md`](../loadtest/README.md).
- **Command:** `make loadtest`
- **Raw k6 output of this run:**
  - [`summary-2026-10-11T15-19-15-411Z.json`](../loadtest/results/summary-2026-10-11T15-19-15-411Z.json)
  - [`stages-2026-10-11T15-19-15-411Z.json`](../loadtest/results/stages-2026-10-11T15-19-15-411Z.json)

All numbers below come from that one run on 2026-10-11 (15:09–15:19 UTC). None are estimated.

## Result

> **The maximum is 50 simultaneous users.** At 50 users actively using the app, p95 latency is 123 ms and there are 0 unexpected errors. At 100 users, p95 rises to 551 ms, past the 500 ms threshold, still with 0 errors.

The server never failed under load. It slowed down. Even at 300 users, it returned no unexpected errors in 10,044 requests. Latency, not correctness, sets the limit.

## Server under test

| | |
| --- | --- |
| Machine | Apple MacBook, **Apple M3, 8 cores (4 performance + 4 efficiency), 8 GB RAM**, macOS 26.2 |
| Runs in | **Docker Desktop**, engine 27.5.1. Linux VM with **8 CPUs and ~3.8 GB RAM** |
| Stack | `docker compose` from this repo: `api` (Node 24, NestJS, **one process**), `postgres:18` (stock settings), `mailpit` |
| API config | Prisma's default `pg` pool (10 connections). argon2id with library defaults. Rate limits raised for the run only (see [Method](#method)) |
| Load generator | k6 v1.0.0-rc1 **on the same laptop** (outside the VM) |
| Network | localhost, through Docker Desktop's port forwarding |

**Conditions during the run.** This is the author's everyday laptop, not a dedicated server. During the run:

- iCloud Drive / File Provider and Spotlight were busy in the background;
- the load average was about 17–28;
- 7.9 GB of the 9.2 GB swap was in use.

Everything shares the same 8 cores: k6, the Docker VM and macOS. The numbers are therefore a **conservative lower bound** for this hardware. Shorter trial runs earlier the same day, under the same background load, put the boundary between 50 and 100 users. One of them had 100 users just under the threshold (p95 498 ms). The committed run is the one this page reports.

## Method

**Scenario.** One k6 script exercises every service at once:

- **auth:** login and token refresh;
- **Track Vote:** suggest, vote and unvote on shared events;
- **Playlist Editor:** add and move with `baseVersion`;
- **reads:** event, playlist, and music search served from the cache.

1. **Seeding** (`setup`, not measured). The script creates its own data, named with a unique run prefix (`ltmv3ymff2`). Nothing outside it was touched or deleted.
   - **300 users:** each one signs up, is verified through the real email link read from the Mailpit API, and logs in.
   - **10 public events** with queued suggestions.
   - **10 public playlists** with 10 tracks each.
   - **A pool of 30 Deezer tracks.**
2. **Warm-up.** The 300 users log in once each, at 4 per second.
3. **Stages.** Six back-to-back stages of **60 s each**, at **25, 50, 100, 150, 200 and 300 concurrent virtual users (VUs)**. One VU is one simulated person in the app. On each iteration it does one action, then "thinks" for 0.5–1.5 s. The action mix:

   | Share | Action |
   | --- | --- |
   | 30% | open an event |
   | 25% | vote or unvote |
   | 15% | playlist edit (`GET`, then add or move with the version it saw) |
   | 10% | open a playlist |
   | 10% | search |
   | 5% | suggest |
   | 4% | refresh token |
   | 1% | fresh login |

   All users share the same 10 events and 10 playlists. This is deliberately worse than real life, where each party has its own event, because it maximizes lock contention on votes and on playlist versions.

4. **Thresholds, per stage.** A stage passes when:
   - p95 of `http_req_duration` is under **500 ms**;
   - **and** unexpected errors are under **1%**. An unexpected error is any non-2xx response, except a `409 VERSION_CONFLICT` on a playlist edit. That 409 is the designed outcome of two people editing at once (AD-3), so it is counted separately.

   The maximum number of simultaneous users is **the highest stage that passes both**.

5. **Rate limits.** The run used raised limits, set through env only, via `docker-compose.loadtest.yml`. k6 sends everything from one IP, so the production limits (100 req/min per IP, 5 auth req/min per IP+account) would otherwise reject almost all of it. Real phones each have their own IP. `make loadtest` restores the normal limits afterwards.

## Results per stage

| VUs | Requests | Req/s | Median | p95 | p99 | Max | Unexpected errors | Playlist edits | 409 conflicts | Result |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :---: |
| 25 | 1,814 | 30.2 | 10.5 ms | **58.1 ms** | 209.6 ms | 292.4 ms | 0.00% | 231 | 3 (1.3%) | PASS |
| **50** | 3,579 | 59.6 | 11.4 ms | **122.8 ms** | 280.8 ms | 580.2 ms | 0.00% | 453 | 8 (1.8%) | **PASS** |
| 100 | 6,402 | 106.7 | 28.7 ms | **550.5 ms** | 918.4 ms | 1,267 ms | 0.00% | 774 | 72 (9.3%) | FAIL (p95) |
| 150 | 7,646 | 127.4 | 220.4 ms | **1,217 ms** | 1,945 ms | 3,597 ms | 0.00% | 946 | 264 (28%) | FAIL (p95) |
| 200 | 8,107 | 135.1 | 459.2 ms | **1,690 ms** | 2,798 ms | 3,714 ms | 0.00% | 1,048 | 423 (40%) | FAIL (p95) |
| 300 | 10,044 | 167.4 | 793.4 ms | **2,099 ms** | 2,970 ms | 3,311 ms | 0.00% | 1,262 | 737 (58%) | FAIL (p95) |

**Warm-up logins:** 300 logins at about 4 per second. Median 73.6 ms, p95 211.8 ms, max 1,922 ms, 0 errors.

**Per endpoint.** These figures cover the whole run, so they are dominated by the saturated stages. They show which calls suffer first.

| Endpoint | Median | p95 | p99 |
| --- | ---: | ---: | ---: |
| `POST /auth/login` | 109 ms | 754 ms | 1,303 ms |
| `POST /auth/refresh` | 183 ms | 968 ms | 1,256 ms |
| `GET /events/:id` | 255 ms | 1,501 ms | 1,989 ms |
| `PUT …/vote` | 499 ms | 2,251 ms | 3,138 ms |
| `DELETE …/vote` | 934 ms | 2,370 ms | 3,125 ms |
| `POST /events/:id/suggestions` | 610 ms | 2,336 ms | 3,259 ms |
| `GET /playlists/:id` | 268 ms | 1,354 ms | 1,678 ms |
| `POST /playlists/:id/tracks` | 16 ms | 304 ms | 591 ms |
| `PATCH /playlists/:id/tracks/:entryId` | 312 ms | 1,405 ms | 1,942 ms |
| `GET /music/search` (cached) | 91 ms | 581 ms | 918 ms |

## Why 50 users is the maximum

- **Both thresholds are met with room to spare at 50.** p95 is 123 ms, a quarter of the budget, and errors are 0%. Throughput is 59.6 requests/s, which is about 1.2 requests per user per second. That is far more than a real party guest sends: a guest votes a few times a minute, not every second. So 50 here is a demanding 50.
- **100 fails.** The p95 is 551 ms. The median stays low (29 ms), but the tail grows. This is the queueing knee: throughput rises less than linearly from 100 to 300 users (107 → 167 req/s), while latency multiplies. In other words, the API is saturated.
- **The limit is the API's single Node.js process, not the database.**
  - Docker CPU samples during the stages showed the `api` container at about 140–270% and `postgres` at about 55–105%, out of 800% available.
  - Node.js runs JavaScript on one main thread; the extra CPU is GC, libuv and argon2 worker threads. So the API is bound by one core: per request it runs JWT verification, a session lookup, Prisma query building, JSON serialization and the ActionLog write.
  - PostgreSQL still had CPU to spare.
- **Correctness held at every load.**
  - 0 unexpected errors out of 37,592 stage requests.
  - Under heavy contention, 58% of playlist edits at 300 users were refused with **409 `VERSION_CONFLICT`** instead of overwriting each other (AD-3). The conflict rate rises with load because 300 people were editing the same 10 playlists. That is the design working, not a failure.

**Capacity statement.** On this laptop, under its background load, one API instance serves **50 simultaneous active users** with p95 under 500 ms. In practice that means 5 parties of 10 guests voting and editing non-stop, or many more mostly idle listeners. Above about 100 users, requests still succeed but slow down: p95 reaches 1–2 s.

## Limitations

- **Socket.IO fan-out is not load-tested.**
  - k6 speaks raw WebSockets, not the Socket.IO protocol (Engine.IO handshake, packet framing, acks). A faithful client would need a k6 extension or a separate Node-based tool.
  - Every state change also goes through REST (AD-1: REST is the only write path), so all the writes, transactions and locks are measured.
  - What is not measured is the extra cost of broadcasting each change to the room's sockets (`queue.updated`, `playlist.updated`, `presence.updated`). This cost grows with the number of listeners per room. It is in-memory work in the same process, so at the stage sizes above it would lower the knee somewhat.
- **Same machine.** The load generator, the Docker VM and macOS share 8 cores and 8 GB of RAM, under background load (see [Conditions](#server-under-test)). A dedicated server would score higher.
- **Single client IP, raised throttles.** The per-IP rate limiter is effectively bypassed. With real users, each phone has its own 100 req/min budget. Behind Docker Desktop's port forwarding, all LAN devices may share one IP; that question is tracked in `deferred-work.md`.
- **Deezer is not in the hot path.** Deezer was only called during setup. During the stages, searches were served from the 10-minute cache and tracks from the database. A cold search depends on Deezer's own latency and rate limits.
- **Logins were spread out.** The warm-up spreads logins at 4/s. argon2 makes a login burst the most expensive event: short trial runs measured about 6 logins/s at saturation. A crowd all logging in during the same second would see multi-second logins.
- **One run.** The committed numbers come from one full run. Shorter trial runs agreed on the boundary between 50 and 100 users.

## How to scale it (not done — out of scope)

1. **Run several API processes**, with Node cluster or more containers. The Socket.IO Redis adapter (spine "Deferred") would let broadcasts reach every process. The concurrency rules live in the database (AD-2, AD-3, AD-9), so no rule changes. This is the first lever, because the API is CPU-bound on one core.
2. **Write the ActionLog in batches** instead of one insert per request, and size the `pg` pool to match.
3. **Cache the session lookup** for a few seconds per `sid`. The trade-off is revocation latency.

## Reproduce

```sh
make up          # once
make loadtest    # ~10 min with the default stages; writes loadtest/results/{summary,stages}-<time>.json
```
