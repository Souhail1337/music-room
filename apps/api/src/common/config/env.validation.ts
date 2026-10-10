/** Validates the env at boot so a missing setting fails fast (AD-11: config only from env). */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const missing = ['DATABASE_URL', 'JWT_ACCESS_SECRET'].filter(
    (key) => typeof env[key] !== 'string' || (env[key] as string).length === 0,
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
  return env;
}

/** Reads a positive integer env value with a default; anything else (e.g. '15abc') uses the default. */
export function intEnv(value: string | undefined, fallback: number): number {
  const text = value?.trim() ?? '';
  const parsed = /^\d+$/.test(text) ? Number(text) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
