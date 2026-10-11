# AI usage — Music Room

This project was built by one student with AI assistance throughout. This page explains:

- which tools were used;
- what each tool produced;
- how the output was checked;
- what was verified by hand.

Every decision in the product and the architecture was reviewed and accepted by the author, who can explain each one without notes (PRD SM-3).

## Tools

| Tool | Used for |
| --- | --- |
| **BMad Method** (installed in `_bmad/`) | Structured planning workflows and personas (analyst, PM, UX, architect, developer, reviewer), each run as a Claude skill |
| **Claude Code** (Anthropic's CLI agent, Claude models) | Running the BMad workflows, implementing each spec, running the tests and tools, and code review |

No AI-generated code went in without passing the tests, and no test was weakened to make code pass.

## 1. Planning (BMad)

The subject PDF (`musicc.pdf`) was turned into planning documents through BMad's guided workflows. Claude drafted each document, and the author answered the workflow's questions, made the decisions and approved the result.

| Artifact | What it fixed |
| --- | --- |
| [`prd.md`](../_bmad-output/planning-artifacts/prds/prd-music-room-2026-10-10/prd.md) + `addendum.md` | Testable FR-1…23 / NFR-1…15. Scope cuts: two of the three services, Google instead of Facebook, Android only. Confirmed assumptions |
| [`DESIGN.md`, `EXPERIENCE.md`](../_bmad-output/planning-artifacts/ux-designs/ux-music-room-2026-10-10/) | Screens, states, copy and key flows (UJ-1…3) |
| [`ARCHITECTURE-SPINE.md`](../_bmad-output/planning-artifacts/architecture/architecture-music-room-2026-10-10/ARCHITECTURE-SPINE.md) | Modular NestJS monolith. AD-1…AD-11: REST-only writes, DB-enforced votes, versioned playlist edits, a single access policy, server-side on-site checks, JWT with rotating refresh tokens, privacy at response time |

**Checked by the author:**

- the requirement list against the subject, item by item;
- every architecture decision, especially the concurrency rules (AD-2, AD-3, AD-9), which are the ones evaluators question most.

## 2. Implementation (Claude Code, spec by spec)

The work was split into five specs in [`_bmad-output/implementation-artifacts/`](../_bmad-output/implementation-artifacts/):

- A: foundation and accounts
- B: Track Vote
- C: Playlist Editor
- D: profile and friends
- E: delivery (this load test, the docs, CI and secret scanning)

A separate spec covered a UI redesign.

Each spec follows the same structure:

- **A frozen intent** (problem, approach, boundaries) owned by the author. The agent may not change it.
- **A code map and task list** for the agent.
- **Acceptance criteria and verification commands** that must pass before the spec is done: lint, build, unit tests, and e2e tests against a real PostgreSQL.
- **A "deferred work" log** ([`deferred-work.md`](../_bmad-output/implementation-artifacts/deferred-work.md)). Anything found but not fixed is recorded there instead of silently dropped.

Claude Code wrote the code, the tests and the migrations, and ran the verification commands itself in a Node 24 container.

## 3. Review (AI, triaged by hand)

After a spec was implemented, a multi-reviewer pass (BMad code review) ran several independent reviewers over the diff:

- **blind hunter:** reads the diff without context;
- **edge-case hunter:** looks for unhandled cases;
- **verification-gap hunter:** looks for behaviour that no test covers.

The findings were triaged into **patch**, **reject** (with a reason) or **defer**. The table is kept in each spec's *Review Triage Log*. Examples of real bugs that review caught and that were fixed:

- **Parallel refresh race** (spec A). A losing refresh could revoke the family before the winner's token existed. Fixed with `SessionsService.confirmRotation`, and an e2e test now covers it.
- **No-op playlist moves** (spec C). They bumped the version and caused spurious 409s.
- **Accept versus cancel race on a friend request** (spec D). It could create a friendship after the cancel returned 204.

Rejected findings are listed with their reason, so the decisions stay auditable.

## 4. What was checked by hand

- **Every spec's manual checks** in its *Verification* section, on the Android emulator, with a second account driven by curl. Examples:
  - sign-up, then the Mailpit link, then log in;
  - two sessions voting with the queue updating live;
  - a stale playlist move showing the conflict notice;
  - the friends-only profile section.
- **The UI redesign**, verified on device by the author before delivery.
- **The concurrency guarantees.** The author read the vote and playlist transaction code and its concurrency tests (`apps/api/test/concurrency/`) line by line, because those are the parts a reviewer will question.
- **The load-test numbers** in [LOADTEST.md](LOADTEST.md). They come from an actual run on the author's machine; the raw k6 output is committed in `loadtest/results/`, and nothing is estimated.
- **The security claims** in [SECURITY.md](SECURITY.md). Each one links to the code that implements it, so it can be checked directly.

## Limits and lessons

- **The AI is fast but confidently wrong in places.** Examples: outdated Expo or Prisma APIs, and comments that don't match the code. Pinned versions, the Expo version-specific docs and failing tests caught these, not trust in the output.
- **Reviewers find real bugs, and also noise.** The triage step, a human verdict per finding, is what keeps the review useful.
- **The frozen intent was the most important control.** It stopped the agent from "improving" scope or rules, for example from changing API behaviour during the delivery spec.
