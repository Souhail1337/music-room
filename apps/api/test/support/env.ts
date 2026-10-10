import { config } from 'dotenv';

/** Loads the env for e2e tests and points the app at the dedicated test database. */
export function loadTestEnv(): string {
  if (process.env.MUSIC_ROOM_E2E === '1') return process.env.DATABASE_URL!;
  config({ path: ['.env', '../../.env'], quiet: true });
  const testUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://musicroom:musicroom@localhost:5432/musicroom_test';
  if (
    process.env.DATABASE_URL &&
    testUrl === process.env.DATABASE_URL &&
    !process.env.CI
  ) {
    throw new Error(
      'TEST_DATABASE_URL must differ from DATABASE_URL: the e2e tests wipe their database.',
    );
  }
  process.env.DATABASE_URL = testUrl;
  process.env.MUSIC_ROOM_E2E = '1';
  process.env.JWT_ACCESS_SECRET ??= 'e2e-secret';
  process.env.API_PUBLIC_URL = 'http://localhost:3000';
  // The global limit is raised so the suite itself isn't throttled; the auth limit stays at its real value.
  process.env.THROTTLE_LIMIT = '100000';
  process.env.AUTH_THROTTLE_LIMIT = '5';
  process.env.GOOGLE_WEB_CLIENT_ID = 'e2e-client.apps.googleusercontent.com';
  return testUrl;
}
