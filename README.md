# Music Room

Music Room lets the people in a room decide together what plays next, and lets friends build playlists together in real time. It has two parts:

- an **Android app** (Expo / React Native), which works as a remote control;
- a **NestJS API** with PostgreSQL and Socket.IO, which holds all the state.

It implements the mandatory part of the 42 subject *Music Room*:

- accounts with email verification and Google sign-in;
- profiles with three privacy levels, and friends;
- **Music Track Vote**: a live queue that guests vote on, played on the host's phone;
- **Music Playlist Editor**: collaborative editing with version checks;
- a documented REST API, security, action logging, a measured load capacity and CI.

| | |
| --- | --- |
| Requirements | [PRD](_bmad-output/planning-artifacts/prds/prd-music-room-2026-10-10/prd.md), [UX](_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/) |
| Architecture | [Architecture spine](_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md) (AD-1…AD-11) |
| API reference | Swagger UI at `http://localhost:3000/docs` once the stack is running |
| Security | [docs/SECURITY.md](docs/SECURITY.md) |
| Load test | [docs/LOADTEST.md](docs/LOADTEST.md), [loadtest/README.md](loadtest/README.md) |
| AI usage | [docs/AI_USAGE.md](docs/AI_USAGE.md) |

```text
apps/api      NestJS API (REST + Socket.IO), Prisma, PostgreSQL 18
apps/mobile   Expo SDK 57 app (expo-router, react-native-paper, React Query)
loadtest/     k6 load test
docs/         SECURITY, LOADTEST, AI_USAGE
```

## Prerequisites

- **Docker** with compose v2. Docker Desktop on macOS or Windows works.
- **Node.js 24 LTS** ([`.nvmrc`](.nvmrc), e.g. `nvm use`). Prisma 7 needs Node 20.19+, 22.12+ or 24, and `make` checks the version.
- **To run the app**, one of:
  - **Expo Go** on an Android phone on the same Wi-Fi as your computer. Nothing else is needed.
  - The **Android SDK** and an emulator, or a phone over USB, to build the dev client. Google sign-in only works in this dev build.
- **Optional:**
  - [k6](https://k6.io), for the load test (`brew install k6`). Without it, `make loadtest` uses the k6 Docker image.
  - [gitleaks](https://github.com/gitleaks/gitleaks), for the pre-commit secret scan (`brew install gitleaks`).

## Quick start (fresh clone)

```sh
make install   # creates .env from .env.example, installs API + mobile deps, generates the Prisma client
make up        # builds and starts api + postgres + mailpit; the API applies its migrations on start
make hooks     # optional: enable the gitleaks pre-commit hook
```

Once `make up` is done, these are available:

| Service | URL |
| --- | --- |
| API | `http://localhost:3000` (health: `/health`) |
| Swagger UI | `http://localhost:3000/docs` |
| Mailpit, which catches every email: verification and password-reset links | `http://localhost:8025` |

`make help` lists every target, and `make down` stops the stack (the database volume is kept).

Configuration lives only in `.env`, which is git-ignored and created from [`.env.example`](.env.example). The defaults work as-is for local use. Things you may want to set:

- `JWT_ACCESS_SECRET`: set your own for anything beyond local use.
- `GOOGLE_WEB_CLIENT_ID`: needed for Google sign-in (see [Run the app](#run-the-app)).
- `API_PUBLIC_URL`: the address used in email links. Set it to your LAN IP if you open those links on a phone.

## Run the app

**On a phone with Expo Go** (same Wi-Fi as the computer):

```sh
make mobile-go   # scan the QR code with Expo Go
```

**On an emulator or USB device, as a dev build:**

```sh
make mobile      # npx expo run:android
```

The app reaches the API through the **Server URL** setting. You can change it in **Settings → Server URL**, also before logging in, and the **Test** button checks it. The default is:

- port 3000 on the machine that serves the JS bundle, which works on a phone on the same Wi-Fi;
- `http://10.0.2.2:3000` on the Android emulator.

**Demo flow:**

1. Sign up.
2. Open the verification link from Mailpit (`http://localhost:8025`), then tap **I've verified**.
3. Create an event or a playlist.
4. Log in with a second account on another device or emulator to vote or edit together.

**Google sign-in** needs the same web client ID in both `.env` files:

- `GOOGLE_WEB_CLIENT_ID` in the root `.env`, so the API can verify the ID token;
- `GOOGLE_WEB_CLIENT_ID` in `apps/mobile/.env` (see [`apps/mobile/.env.example`](apps/mobile/.env.example)), so the app can request the token.

It also needs the dev build (`make mobile`); it doesn't work in Expo Go.

## Tests

```sh
make test         # API unit tests, API e2e tests (against the compose Postgres), mobile jest tests
make lint         # API: oxlint + build; mobile: tsc + expo lint
```

- **API e2e tests:**
  - They run against a separate database, `musicroom_test`, set by `TEST_DATABASE_URL`, which the test setup migrates and wipes.
  - They include the concurrency tests for votes and playlist moves in `apps/api/test/concurrency/`.
- **Mobile tests** (`cd apps/mobile && npx jest`): a smoke test that renders the Welcome screen, plus unit tests for:
  - the API client's single-flight token refresh;
  - the auth state machine;
  - the playlist cache and conflict rules;
  - the profile form helpers.

If your host Node isn't 24, run the API checks in a container instead:

```sh
docker run --rm --network music-room_default -v "$PWD/apps/api":/app -v musicroom-api-nm:/app/node_modules -w /app \
  -e TEST_DATABASE_URL=postgresql://musicroom:musicroom@postgres:5432/musicroom_test node:24 \
  sh -c 'npm ci && npx prisma generate && npm run lint && npm run build && npm test && npm run test:e2e'
```

## Load test

```sh
make loadtest                                  # ~10 min: seeds its own users, runs 6 stages, writes loadtest/results/*.json
make loadtest STAGES=50,100 STAGE_SECONDS=30   # a shorter run
```

A single k6 script exercises auth, Track Vote, playlist editing and reads at the same time. The rate limits are raised for the run through env only, then restored afterwards. The method, the machine and the measured maximum number of simultaneous users are in [docs/LOADTEST.md](docs/LOADTEST.md).

## CI and secret scanning

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request. It has three jobs:

- **api**: Node 24 with a Postgres 18 service; `npm ci`, `prisma generate`, lint, build, unit tests and e2e tests.
- **mobile**: `npm ci`, `tsc`, `expo lint` and `jest`.
- **secrets**: gitleaks over the whole git history.

Every action is pinned to a commit SHA.

To scan for secrets locally:

- `make hooks` enables [`.githooks/pre-commit`](.githooks/pre-commit), which runs gitleaks on staged changes and blocks the commit if it finds a secret.
- `make secrets` scans the whole history.

To try the hook, stage a file containing a fake AWS access key: `AKIA` followed by 16 random uppercase letters and digits, for example `aws_access_key_id = AKIA…`. AWS's documentation key `AKIAIOSFODNN7EXAMPLE`, and any key ending in `EXAMPLE`, is allowlisted by gitleaks itself, so it won't trigger. Only [`.env.example`](.env.example) files are committed; `.env` never is.
