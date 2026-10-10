/** Every API error has the shape `{ code, message, details? }` (AD-11). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Per-field messages of a 400 VALIDATION_FAILED. */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: Record<string, string[]> } | undefined)?.fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0] ?? 'Invalid value.']));
  }
}

/** The server could not be reached at all (wrong URL, offline, timeout). */
export class NetworkError extends Error {
  constructor(readonly cause?: unknown) {
    super("Can't reach the server. Check the server URL in Settings.");
    this.name = 'NetworkError';
  }
}

/** A user-facing sentence for any error (EXPERIENCE.md voice: short, no error codes). */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Something went wrong. Try again.';
}
