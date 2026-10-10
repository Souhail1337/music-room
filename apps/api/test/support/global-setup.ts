import { execSync } from 'node:child_process';
import pg from 'pg';
import { loadTestEnv } from './env.js';

/** Migrates the test database once and wipes it before the suite. */
export default async function setup(): Promise<void> {
  const url = loadTestEnv();
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(
    'TRUNCATE action_logs, auth_tokens, sessions, users CASCADE',
  );
  await client.end();
}
