// Music Room load test (NFR-11, NFR-12). Run it with `make loadtest` — see loadtest/README.md.
//
// One script exercises every service at once: auth (login + refresh), Track Vote (suggest,
// vote/unvote on shared events), Playlist editing (add/move with baseVersion) and reads (event,
// playlist, cached music search). Each load level is its own scenario ("stage") so k6 reports
// p95 and the unexpected-error rate per stage; the highest stage meeting both thresholds is the
// maximum number of simultaneous users.
//
// Data safety: setup() creates its own users (signup → verify through the Mailpit API → login),
// events and playlists, all named with a unique run prefix. Nothing is ever deleted or modified
// outside what this run created.

import http from 'k6/http';
import { fail, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// ---------------------------------------------------------------------------------------------
// Configuration (env)
// ---------------------------------------------------------------------------------------------
const API = (__ENV.API_URL || 'http://localhost:3000').replace(/\/$/, '');
const MAILPIT = (__ENV.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const STAGES = (__ENV.STAGES || '25,50,100,150,200,300')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n > 0);
const STAGE_SECONDS = parseInt(__ENV.STAGE_SECONDS || '60', 10);
const GRACE_SECONDS = 10;
const RESULTS_DIR = __ENV.RESULTS_DIR || 'loadtest/results';
const SHARED_EVENTS = parseInt(__ENV.SHARED_EVENTS || '10', 10);
const SHARED_PLAYLISTS = parseInt(__ENV.SHARED_PLAYLISTS || '10', 10);
const P95_MS = 500;
const MAX_ERROR_RATE = 0.01;
const PASSWORD = 'loadtest correct horse';
const SEARCHES = ['daft punk', 'justice', 'one more time', 'the weeknd', 'dua lipa'];
const MAX_USERS = Math.max(...STAGES);

const stageName = (vus) => `vus_${String(vus).padStart(4, '0')}`;

// ---------------------------------------------------------------------------------------------
// Scenarios: one constant-VU scenario per stage, run back to back.
// ---------------------------------------------------------------------------------------------
// Warm-up: every simulated user logs in once, spread out at LOGIN_RATE per second, so the stages
// measure N users *using* the app. Login is measured here (argon2 makes it the most expensive call)
// and again in the stages, where 1% of actions are a fresh login and 4% a token refresh.
const LOGIN_RATE = parseFloat(__ENV.LOGIN_RATE || '4');
const WARMUP_SECONDS = Math.ceil(MAX_USERS / LOGIN_RATE) + 5;
const STAGES_START = WARMUP_SECONDS + GRACE_SECONDS;

const scenarios = {
  warmup: {
    executor: 'per-vu-iterations',
    exec: 'warmup',
    vus: MAX_USERS,
    iterations: 1,
    maxDuration: `${WARMUP_SECONDS}s`,
    gracefulStop: `${GRACE_SECONDS}s`,
  },
};
const thresholds = {
  'http_req_duration{scenario:warmup}': ['max>=0'],
  'http_reqs{scenario:warmup}': ['count>=0'],
  'unexpected_errors{scenario:warmup}': ['rate>=0'],
};
STAGES.forEach((vus, i) => {
  const name = stageName(vus);
  scenarios[name] = {
    executor: 'constant-vus',
    vus,
    duration: `${STAGE_SECONDS}s`,
    startTime: `${STAGES_START + i * (STAGE_SECONDS + GRACE_SECONDS)}s`,
    gracefulStop: `${GRACE_SECONDS}s`,
  };
  // The thresholds produce per-stage sub-metrics in the summary; they are not run-wide gates:
  // the top stages are expected to cross them (that's how the ceiling is found).
  thresholds[`http_req_duration{scenario:${name}}`] = [`p(95)<${P95_MS}`];
  thresholds[`unexpected_errors{scenario:${name}}`] = [`rate<${MAX_ERROR_RATE}`];
  thresholds[`http_reqs{scenario:${name}}`] = ['count>=0'];
  thresholds[`iterations{scenario:${name}}`] = ['count>=0'];
  thresholds[`version_conflicts{scenario:${name}}`] = ['count>=0'];
  thresholds[`playlist_edits{scenario:${name}}`] = ['count>=0'];
});

// Per-endpoint latency over the whole run (diagnostics for docs/LOADTEST.md).
const ENDPOINTS = [
  'POST /auth/login',
  'POST /auth/refresh',
  'GET /events/:id',
  'PUT /events/:id/suggestions/:sid/vote',
  'DELETE /events/:id/suggestions/:sid/vote',
  'POST /events/:id/suggestions',
  'GET /playlists/:id',
  'POST /playlists/:id/tracks',
  'PATCH /playlists/:id/tracks/:entryId',
  'GET /music/search',
];
ENDPOINTS.forEach((name) => {
  thresholds[`http_req_duration{name:${name}}`] = ['max>=0'];
});

export const options = {
  scenarios,
  thresholds,
  setupTimeout: '15m',
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------------------------
const unexpectedErrors = new Rate('unexpected_errors');
const versionConflicts = new Counter('version_conflicts');
const playlistEdits = new Counter('playlist_edits');

/** 2xx is expected everywhere; a 409 VERSION_CONFLICT is an expected outcome of playlist edits. */
const EXPECTED_OK = http.expectedStatuses({ min: 200, max: 299 });
const EXPECTED_EDIT = http.expectedStatuses({ min: 200, max: 299 }, 409);

function errorCode(res) {
  try {
    return res.json('code');
  } catch (_) {
    return null;
  }
}

/** Records the request in the error rate and returns it. */
function track(res, label, { conflictOk = false } = {}) {
  const ok = res.status >= 200 && res.status < 300;
  const conflict = conflictOk && res.status === 409 && errorCode(res) === 'VERSION_CONFLICT';
  if (conflict) versionConflicts.add(1);
  const unexpected = !ok && !conflict;
  unexpectedErrors.add(unexpected, { action: label });
  if (unexpected && __ENV.VERBOSE) {
    console.warn(`${label}: ${res.status} ${String(res.body).slice(0, 200)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------------------------
const HEADERS = {
  'Content-Type': 'application/json',
  'X-Platform': 'k6',
  'X-Device': 'loadtest',
  'X-App-Version': 'loadtest',
};

const authHeaders = (token) => Object.assign({ Authorization: `Bearer ${token}` }, HEADERS);

function params(token, tag, extra) {
  return Object.assign(
    {
      headers: token ? authHeaders(token) : HEADERS,
      tags: { name: tag },
      responseCallback: EXPECTED_OK,
    },
    extra || {},
  );
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------------------------------------
// Setup: seed this run's users, events and playlists.
// ---------------------------------------------------------------------------------------------
function mailpitToken(email) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = http.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=1`,
      { tags: { name: 'mailpit search' } },
    );
    const messages = search.status === 200 ? search.json('messages') || [] : [];
    if (messages.length) {
      const msg = http.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`, {
        tags: { name: 'mailpit message' },
      });
      const match = String(msg.json('Text') || '').match(/\/auth\/verify\?token=([A-Za-z0-9_\-.~%]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    sleep(0.25);
  }
  return null;
}

function seedUsers(prefix) {
  const users = [];
  const BATCH = 20;
  for (let start = 0; start < MAX_USERS; start += BATCH) {
    const chunk = [];
    for (let i = start; i < Math.min(start + BATCH, MAX_USERS); i++) {
      chunk.push({ email: `${prefix}.u${i}@loadtest.example.com`, displayName: `${prefix} u${i}` });
    }
    const signups = http.batch(
      chunk.map((u) => [
        'POST',
        `${API}/auth/signup`,
        JSON.stringify({ email: u.email, password: PASSWORD, displayName: u.displayName }),
        params(null, 'setup signup'),
      ]),
    );
    signups.forEach((res, j) => {
      if (res.status !== 201) fail(`signup ${chunk[j].email}: ${res.status} ${res.body}`);
      chunk[j].id = res.json('user.id');
    });
    const tokens = chunk.map((u) => mailpitToken(u.email));
    const verifies = http.batch(
      tokens.map((token, j) => {
        if (!token) fail(`no verification mail for ${chunk[j].email}`);
        return ['GET', `${API}/auth/verify?token=${encodeURIComponent(token)}`, null, params(null, 'setup verify')];
      }),
    );
    verifies.forEach((res, j) => {
      if (res.status !== 200) fail(`verify ${chunk[j].email}: ${res.status}`);
    });
    chunk.forEach((u) => users.push({ id: u.id, email: u.email }));
  }
  return users;
}

function login(email) {
  return http.post(
    `${API}/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    params(null, 'POST /auth/login'),
  );
}

export function setup() {
  const health = http.get(`${API}/health`);
  if (health.status !== 200) fail(`API not healthy at ${API}: ${health.status}`);
  const mailpit = http.get(`${MAILPIT}/api/v1/info`);
  if (mailpit.status !== 200) fail(`Mailpit API not reachable at ${MAILPIT}: ${mailpit.status}`);

  const prefix = `lt${Date.now().toString(36)}`;
  console.log(`run prefix: ${prefix} — seeding ${MAX_USERS} users`);
  const users = seedUsers(prefix);

  const owner = login(users[0].email);
  if (owner.status !== 200) fail(`login: ${owner.status} ${owner.body}`);
  const ownerToken = owner.json('accessToken');

  // Track pool from Deezer (through the API), and warm the search cache for the read mix.
  let pool = [];
  for (const q of SEARCHES) {
    const res = http.get(`${API}/music/search?q=${encodeURIComponent(q)}`, params(ownerToken, 'setup search'));
    if (res.status !== 200) fail(`music search "${q}": ${res.status} ${res.body} (is Deezer reachable?)`);
    if (q === SEARCHES[0] || q === SEARCHES[1]) pool = pool.concat(res.json('items').map((t) => t.id));
  }
  pool = Array.from(new Set(pool)).slice(0, 30);
  if (pool.length < 10) fail(`only ${pool.length} tracks found on Deezer`);

  // Shared events (public, everyone) with a queue to vote on. The first one resolves every track
  // through Deezer once, one at a time; the rest read the Track rows from the database.
  const events = [];
  for (let i = 0; i < SHARED_EVENTS; i++) {
    const res = http.post(
      `${API}/events`,
      JSON.stringify({ name: `${prefix} event ${i}`, visibility: 'public', license: 'everyone' }),
      params(ownerToken, 'setup event'),
    );
    if (res.status !== 201) fail(`create event: ${res.status} ${res.body}`);
    events.push(res.json('event.id'));
  }
  pool.forEach((trackId) => {
    const res = http.post(`${API}/events/${events[0]}/suggestions`, JSON.stringify({ trackId }), params(ownerToken, 'setup suggest'));
    if (res.status !== 200) fail(`suggest ${trackId}: ${res.status} ${res.body}`);
    sleep(0.15); // stay well under Deezer's public rate limit
  });
  for (let i = 1; i < events.length; i++) {
    const batch = http.batch(
      pool.slice(0, 15).map((trackId) => [
        'POST',
        `${API}/events/${events[i]}/suggestions`,
        JSON.stringify({ trackId }),
        params(ownerToken, 'setup suggest'),
      ]),
    );
    batch.forEach((res) => res.status === 200 || fail(`suggest: ${res.status} ${res.body}`));
  }

  // Shared playlists (public, everyone) with 10 tracks each, so moves have something to move.
  const playlists = [];
  for (let i = 0; i < SHARED_PLAYLISTS; i++) {
    const res = http.post(
      `${API}/playlists`,
      JSON.stringify({ name: `${prefix} playlist ${i}`, visibility: 'public', license: 'everyone' }),
      params(ownerToken, 'setup playlist'),
    );
    if (res.status !== 201) fail(`create playlist: ${res.status} ${res.body}`);
    const id = res.json('playlist.id');
    let version = res.json('version');
    for (const trackId of pool.slice(0, 10)) {
      const add = http.post(
        `${API}/playlists/${id}/tracks`,
        JSON.stringify({ trackId, baseVersion: version }),
        params(ownerToken, 'setup add'),
      );
      if (add.status !== 200) fail(`add track: ${add.status} ${add.body}`);
      version = add.json('version');
    }
    playlists.push(id);
  }

  console.log(`seeded ${users.length} users, ${events.length} events, ${playlists.length} playlists, ${pool.length} tracks`);
  return { prefix, users, events, playlists, pool, startedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------------------------------------
// Virtual user: one simulated app user. Module-level state is per VU.
// ---------------------------------------------------------------------------------------------
let session = null; // { email, access, refresh }
const eventCache = {}; // eventId -> last EventDetail seen

function ensureSession(data) {
  if (session) return true;
  const user = data.users[(__VU - 1) % data.users.length];
  const res = track(login(user.email), 'login');
  if (res.status !== 200) return false;
  session = { email: user.email, access: res.json('accessToken'), refresh: res.json('refreshToken') };
  return true;
}

function doLogin() {
  const res = track(login(session.email), 'login');
  if (res.status === 200) {
    session.access = res.json('accessToken');
    session.refresh = res.json('refreshToken');
  }
}

function doRefresh() {
  const res = track(
    http.post(`${API}/auth/refresh`, JSON.stringify({ refreshToken: session.refresh }), params(null, 'POST /auth/refresh')),
    'refresh',
  );
  if (res.status === 200) {
    session.access = res.json('accessToken');
    session.refresh = res.json('refreshToken');
  } else {
    session = null; // log in again next iteration
  }
}

function getEvent(eventId) {
  const res = track(http.get(`${API}/events/${eventId}`, params(session.access, 'GET /events/:id')), 'get event');
  if (res.status === 200) eventCache[eventId] = res.json();
  return res;
}

function getPlaylist(playlistId) {
  return track(http.get(`${API}/playlists/${playlistId}`, params(session.access, 'GET /playlists/:id')), 'get playlist');
}

function search() {
  const q = pick(SEARCHES);
  track(http.get(`${API}/music/search?q=${encodeURIComponent(q)}`, params(session.access, 'GET /music/search')), 'search');
}

function voteOrUnvote(data) {
  const eventId = pick(data.events);
  if (!eventCache[eventId]) getEvent(eventId);
  const state = eventCache[eventId];
  if (!state || !state.queue || !state.queue.length) return;
  const suggestion = pick(state.queue);
  const voted = (state.myVotes || []).indexOf(suggestion.id) >= 0;
  const url = `${API}/events/${eventId}/suggestions/${suggestion.id}/vote`;
  const res = voted
    ? track(http.del(url, null, params(session.access, 'DELETE /events/:id/suggestions/:sid/vote')), 'unvote')
    : track(http.put(url, '{}', params(session.access, 'PUT /events/:id/suggestions/:sid/vote')), 'vote');
  if (res.status === 200) eventCache[eventId] = res.json();
}

function suggest(data) {
  const eventId = pick(data.events);
  const res = track(
    http.post(`${API}/events/${eventId}/suggestions`, JSON.stringify({ trackId: pick(data.pool) }), params(session.access, 'POST /events/:id/suggestions')),
    'suggest',
  );
  if (res.status === 200) eventCache[eventId] = res.json();
}

/** Like the app: look at the current state (the app has it from pushes), then edit with its version. */
function editPlaylist(data) {
  const playlistId = pick(data.playlists);
  const current = getPlaylist(playlistId);
  if (current.status !== 200) return;
  const state = current.json();
  const inList = {};
  state.tracks.forEach((e) => (inList[e.track.id] = true));
  const missing = data.pool.filter((id) => !inList[id]);
  const editParams = (tag) => params(session.access, tag, { responseCallback: EXPECTED_EDIT });

  playlistEdits.add(1);
  if (missing.length && (state.tracks.length < 2 || Math.random() < 0.3)) {
    track(
      http.post(
        `${API}/playlists/${playlistId}/tracks`,
        JSON.stringify({ trackId: pick(missing), baseVersion: state.version }),
        editParams('POST /playlists/:id/tracks'),
      ),
      'add track',
      { conflictOk: true },
    );
    return;
  }
  if (state.tracks.length < 2) return;
  const from = Math.floor(Math.random() * state.tracks.length);
  let to = Math.floor(Math.random() * (state.tracks.length - 1));
  if (to >= from) to += 1;
  track(
    http.patch(
      `${API}/playlists/${playlistId}/tracks/${state.tracks[from].id}`,
      JSON.stringify({ toIndex: to, baseVersion: state.version }),
      editParams('PATCH /playlists/:id/tracks/:entryId'),
    ),
    'move track',
    { conflictOk: true },
  );
}

/** Warm-up scenario: VU n logs in at about n / LOGIN_RATE seconds. */
export function warmup(data) {
  sleep((__VU - 1) / LOGIN_RATE);
  ensureSession(data);
}

export default function (data) {
  if (!ensureSession(data)) {
    sleep(1);
    return;
  }
  const r = Math.random();
  if (r < 0.25) getEvent(pick(data.events));
  else if (r < 0.35) getPlaylist(pick(data.playlists));
  else if (r < 0.45) search();
  else if (r < 0.7) voteOrUnvote(data);
  else if (r < 0.75) suggest(data);
  else if (r < 0.9) editPlaylist(data);
  else if (r < 0.91) doLogin();
  else if (r < 0.95) doRefresh();
  else getEvent(pick(data.events));
  // Think time: a person taps every ~0.5–1.5 s while using the app.
  sleep(0.5 + Math.random());
}

// ---------------------------------------------------------------------------------------------
// Summary: per-stage table on stdout + raw k6 summary JSON under loadtest/results/.
// ---------------------------------------------------------------------------------------------
function metricValues(data, name) {
  const m = data.metrics[name];
  return m ? m.values : null;
}

function stageRows(data) {
  return STAGES.map((vus) => {
    const name = stageName(vus);
    const dur = metricValues(data, `http_req_duration{scenario:${name}}`) || {};
    const errors = metricValues(data, `unexpected_errors{scenario:${name}}`) || {};
    const reqs = metricValues(data, `http_reqs{scenario:${name}}`) || {};
    const iters = metricValues(data, `iterations{scenario:${name}}`) || {};
    const conflicts = metricValues(data, `version_conflicts{scenario:${name}}`) || {};
    const edits = metricValues(data, `playlist_edits{scenario:${name}}`) || {};
    const p95 = dur['p(95)'];
    const errorRate = errors.rate;
    return {
      stage: name,
      vus,
      requests: reqs.count || 0,
      reqPerSec: (reqs.count || 0) / STAGE_SECONDS,
      iterations: iters.count || 0,
      medMs: dur.med,
      p95Ms: p95,
      p99Ms: dur['p(99)'],
      maxMs: dur.max,
      unexpectedErrorRate: errorRate,
      playlistEdits: edits.count || 0,
      versionConflicts: conflicts.count || 0,
      passed: p95 !== undefined && p95 < P95_MS && errorRate !== undefined && errorRate < MAX_ERROR_RATE,
    };
  });
}

const fmt = (n, digits = 1) => (n === undefined || n === null ? '-' : Number(n).toFixed(digits));

function table(rows) {
  const lines = [
    '',
    `Per-stage results (thresholds: p95 < ${P95_MS} ms, unexpected errors < ${MAX_ERROR_RATE * 100}%)`,
    '',
    '  VUs   requests  req/s   med ms   p95 ms   p99 ms   max ms   errors   edits  409s   result',
  ];
  rows.forEach((r) => {
    lines.push(
      `  ${String(r.vus).padStart(4)}  ${String(r.requests).padStart(8)}  ${fmt(r.reqPerSec).padStart(6)}  ${fmt(r.medMs).padStart(7)}  ${fmt(r.p95Ms).padStart(7)}  ${fmt(r.p99Ms).padStart(7)}  ${fmt(r.maxMs).padStart(7)}  ${(fmt((r.unexpectedErrorRate || 0) * 100, 2) + '%').padStart(7)}  ${String(r.playlistEdits).padStart(6)}  ${String(r.versionConflicts).padStart(4)}   ${r.passed ? 'PASS' : 'FAIL'}`,
    );
  });
  const passing = rows.filter((r) => r.passed);
  const max = passing.reduce((best, r) => Math.max(best, r.vus), 0);
  lines.push('', `Max simultaneous users meeting both thresholds: ${max}`, '');
  return { text: lines.join('\n'), max };
}

export function handleSummary(data) {
  const rows = stageRows(data);
  const { text, max } = table(rows);
  const endpoints = ENDPOINTS.map((name) => {
    const v = metricValues(data, `http_req_duration{name:${name}}`) || {};
    return { endpoint: name, medMs: v.med, p95Ms: v['p(95)'], p99Ms: v['p(99)'], maxMs: v.max };
  });
  const endpointText = ['Per-endpoint latency, whole run (ms):', '']
    .concat(
      endpoints.map(
        (e) => `  ${e.endpoint.padEnd(42)} med ${fmt(e.medMs).padStart(7)}  p95 ${fmt(e.p95Ms).padStart(7)}  p99 ${fmt(e.p99Ms).padStart(7)}`,
      ),
    )
    .join('\n');
  const w = {
    dur: metricValues(data, 'http_req_duration{scenario:warmup}') || {},
    reqs: metricValues(data, 'http_reqs{scenario:warmup}') || {},
    errors: metricValues(data, 'unexpected_errors{scenario:warmup}') || {},
  };
  const warmupRow = {
    logins: w.reqs.count || 0,
    targetLoginsPerSec: LOGIN_RATE,
    medMs: w.dur.med,
    p95Ms: w.dur['p(95)'],
    maxMs: w.dur.max,
    unexpectedErrorRate: w.errors.rate,
  };
  const warmupText = `Warm-up: ${warmupRow.logins} logins at ~${LOGIN_RATE}/s — med ${fmt(warmupRow.medMs)} ms, p95 ${fmt(warmupRow.p95Ms)} ms, max ${fmt(warmupRow.maxMs)} ms, errors ${fmt((warmupRow.unexpectedErrorRate || 0) * 100, 2)}%`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = {};
  out.stdout = textSummary(data, { indent: ' ', enableColors: true }) + '\n' + warmupText + '\n' + text + '\n' + endpointText + '\n';
  out[`${RESULTS_DIR}/summary-${stamp}.json`] = JSON.stringify(data, null, 2);
  out[`${RESULTS_DIR}/stages-${stamp}.json`] = JSON.stringify(
    { warmup: warmupRow, stages: rows, endpoints, maxSimultaneousUsers: max, p95ThresholdMs: P95_MS, maxErrorRate: MAX_ERROR_RATE, stageSeconds: STAGE_SECONDS },
    null,
    2,
  );
  return out;
}

