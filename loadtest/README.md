# Load test (k6)

[`music-room.js`](music-room.js) is the repeatable load test for NFR-11. It runs against the docker compose stack, and its results are written up in [`docs/LOADTEST.md`](../docs/LOADTEST.md).

## Run it

```sh
make loadtest                                  # default stages: 25,50,100,150,200,300 VUs × 60 s
make loadtest STAGES=50,100 STAGE_SECONDS=30   # a quicker run
```

`make loadtest` does four things:

1. **Restarts the stack with raised rate limits.** It applies [`docker-compose.loadtest.yml`](../docker-compose.loadtest.yml), which raises `THROTTLE_LIMIT` and `AUTH_THROTTLE_LIMIT` through env only; no code changes. This is needed because k6 sends everything from one IP, and the normal limits (100 req/min per IP, 5 auth req/min per IP+account) would only measure the throttler.
2. **Runs k6.** It uses your local `k6` if one is installed (`brew install k6`). Otherwise it runs the `grafana/k6` image on the compose network.
3. **Restarts the API with the normal limits.**
4. **Treats k6 exit code 99 ("thresholds crossed") as success.** The top stages are meant to cross the thresholds, because that is how the ceiling is found. Any other failure, such as a failed setup or an unreachable API, fails the target.

Requirements: Docker, and internet access. Setup searches Deezer through the API to build its track pool, and the summary helper is loaded from `jslib.k6.io`.

## What it does

**setup()** seeds this run's own data, all named with a unique prefix (`lt<base36 time>`):

1. **Users.** As many users as the largest stage. Each one goes through the real flow:
   - `POST /auth/signup`;
   - read the verification mail from the **Mailpit API** (`/api/v1/search`, `/api/v1/message/:id`);
   - `GET /auth/verify?token=…`.
2. **Track pool.** About 30 Deezer tracks found through `GET /music/search`. This also warms the 10-minute search cache.
3. **Events.** 10 public events (`everyone` license) with queued suggestions.
4. **Playlists.** 10 public playlists (`everyone` license) with 10 tracks each.

**warmup** logs every simulated user in once, at `LOGIN_RATE` per second (default 4). argon2 makes login the most expensive call, so a burst of logins would otherwise dominate the first stage.

**Stages.** Each stage is its own `constant-vus` scenario, run one after the other, so k6 reports metrics per stage. On each iteration, every VU (one simulated app user) picks one action, then thinks for 0.5–1.5 s:

| Share | Action |
| --- | --- |
| 30% | `GET /events/:id` |
| 10% | `GET /playlists/:id` |
| 10% | `GET /music/search` (served from the cache) |
| 25% | vote or unvote a queued suggestion (`PUT` / `DELETE …/vote`) |
| 5% | `POST /events/:id/suggestions` (an already-queued track becomes a vote) |
| 15% | playlist edit: `GET` the playlist, then add a missing track or move an entry with its `baseVersion` |
| 1% | fresh `POST /auth/login` |
| 4% | `POST /auth/refresh` (rotation; the VU keeps the new token) |

**What counts as an error.** A 409 `VERSION_CONFLICT` on a playlist edit is an expected outcome when two users edit at once. It is counted in `version_conflicts`, not as an error. Any other non-2xx response counts in `unexpected_errors`.

**Thresholds, per stage.** A stage passes when p95 `http_req_duration` < 500 ms **and** `unexpected_errors` < 1%. The maximum number of simultaneous users is the highest stage that passes.

**Output**
- The k6 text summary.
- A per-stage table, the warm-up login numbers and per-endpoint latency.
- `loadtest/results/summary-<timestamp>.json`: the raw k6 summary.
- `loadtest/results/stages-<timestamp>.json`: the table as JSON.

## Data safety

The script never deletes or changes anything it didn't create. Everything it creates carries the run prefix. Each run leaves behind:

- its users, events, playlists and their action-log rows;
- its verification mails in Mailpit.

To start from a clean slate, run `docker compose down -v`. This deletes the whole local database volume, dev data included, so only do it on purpose.

## Settings (env, or make variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `STAGES` | `25,50,100,150,200,300` | VUs per stage |
| `STAGE_SECONDS` | `60` | duration of each stage |
| `LOGIN_RATE` | `4` | warm-up logins per second |
| `API_URL` / `MAILPIT_URL` | `http://localhost:3000` / `http://localhost:8025` | targets |
| `SHARED_EVENTS` / `SHARED_PLAYLISTS` | `10` / `10` | how many shared resources the users contend on |
| `RESULTS_DIR` | `loadtest/results` | where the JSON files go |
| `VERBOSE` | unset | `1` logs every unexpected response |

## Not covered: Socket.IO fan-out

k6 doesn't speak the Socket.IO protocol, only raw WebSockets. Every change also happens over REST (AD-1), so the write path is fully measured. The cost of broadcasting each change to the room's sockets is not. [`docs/LOADTEST.md`](../docs/LOADTEST.md#limitations) discusses this.
