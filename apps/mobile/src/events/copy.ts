import { ApiError, errorMessage } from '../api/errors';
import type { DenyReason, EventInfo, License } from '../api/events';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local HH:MM (times are stored in UTC; the app only displays local time, AD-5). */
export function hhmm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function licenseLabel(license: License, startsAt: string | null, endsAt: string | null): string {
  switch (license) {
    case 'everyone':
      return 'Everyone can vote';
    case 'invited':
      return 'Invited can vote';
    case 'on_site':
      return startsAt && endsAt ? `On-site ${hhmm(startsAt)}–${hhmm(endsAt)}` : 'On-site';
  }
}

/** Banner / snackbar text for a refused action (EXPERIENCE.md voice). */
export function reasonText(
  reason: DenyReason,
  event: Pick<EventInfo, 'startsAt' | 'endsAt'> | null | undefined,
): string {
  const start = hhmm(event?.startsAt ?? null);
  const end = hhmm(event?.endsAt ?? null);
  switch (reason) {
    case 'NOT_INVITED':
      return 'Only invited people can vote in this event.';
    case 'OUTSIDE_AREA':
      return start && end
        ? `Only people at the venue between ${start} and ${end} can vote.`
        : 'Only people at the venue can vote.';
    case 'OUTSIDE_TIME_WINDOW': {
      const before = event?.startsAt && Date.now() < new Date(event.startsAt).getTime();
      if (before) return `Voting opens at ${start}.`;
      return end ? `Voting closed at ${end}.` : 'Voting is closed.';
    }
    case 'LOCATION_REQUIRED':
      return 'Allow location to vote at this event.';
  }
}

const REASONS: DenyReason[] = ['NOT_INVITED', 'OUTSIDE_AREA', 'OUTSIDE_TIME_WINDOW', 'LOCATION_REQUIRED'];

/** A user-facing sentence for an error on the event screen. */
export function eventErrorText(error: unknown, event?: Pick<EventInfo, 'startsAt' | 'endsAt'> | null): string {
  if (error instanceof ApiError && (REASONS as string[]).includes(error.code))
    return reasonText(error.code as DenyReason, event);
  return errorMessage(error);
}
