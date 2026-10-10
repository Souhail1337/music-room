# Music Room — PRD Addendum (technical direction for architecture)

This is the stack Claude recommended. Souhail delegated the choice and must be able to defend it (subject §II, IV.1). The final decisions belong to `bmad-architecture`.

| Layer | Choice | Rationale |
|---|---|---|
| Mobile | React Native + Expo (TypeScript), React Native Paper (M3) | Fast to build, one language with the backend, good Google sign-in support, configurable backend URL |
| Backend | Node.js + NestJS | Structured modules, built-in validation, `@nestjs/swagger` generates the OpenAPI docs (NFR-2) |
| Realtime | Socket.IO (NestJS gateway), one room per Event / Playlist | Pushes within 1s (FR-15, FR-21), reconnects automatically |
| DB | PostgreSQL + Prisma | A unique constraint (user, suggestion) prevents double votes; atomic increments and per-Playlist row locks / version checks give serialized edits (FR-13, FR-20) |
| Auth | JWT access (15 min) + rotating refresh tokens, argon2/bcrypt, Google ID-token verification server-side | NFR-6 |
| Rate limiting | `@nestjs/throttler` | NFR-5 |
| Music | Deezer public API (`api.deezer.com/search`), called through the backend | No API key needed; previews are 30 s; the backend proxy hides the client and allows caching |
| Email | Nodemailer → SMTP; Mailpit in docker for the demo | FR-1, FR-4 |
| Ops | docker compose (api, postgres, mailpit) + Makefile; `.env` git-ignored | NFR-8, NFR-13 |
| Tests / CI | Jest + Supertest; GitHub Actions | NFR-14, NFR-15 |
| Load | k6 scripts in `/loadtest` | NFR-11 |

## Concurrency mechanisms (for the defense)

- **Votes:** `INSERT … ON CONFLICT DO NOTHING` into `votes(user_id, suggestion_id)`, followed by a recount or atomic `UPDATE suggestions SET vote_count = vote_count + 1` in the same transaction. Duplicate requests are idempotent.
- **Playlist:** each Playlist has a `version` integer. An edit runs `SELECT … FOR UPDATE` on the playlist row, checks `version == client_version`, applies the change, increments `version`, and broadcasts. A version mismatch returns 409 with the current state. Positions are rewritten inside the transaction.
