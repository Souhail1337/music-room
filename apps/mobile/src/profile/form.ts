import type { ApiError } from '../api/errors';
import type { ProfileUpdate } from '../api/users';
import type { SectionKey } from './components';

/** Form values of one profile section, keyed by field. */
export type Values = Record<string, string>;

const list = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** The PATCH body for one section. Empty fields are sent as '' / [] so the server clears them. */
export function toUpdate(section: SectionKey, v: Values): ProfileUpdate {
  switch (section) {
    case 'public':
      return { displayName: v.displayName.trim(), public: { bio: v.bio.trim(), city: v.city.trim() } };
    case 'friends':
      return { friends: { phone: v.phone.trim(), birthday: v.birthday.trim() } };
    case 'private':
      return { private: { fullName: v.fullName.trim(), address: v.address.trim() } };
    case 'music':
      return { musicPrefs: { genres: list(v.genres), artists: list(v.artists) } };
  }
}

/** Server field paths ("public.bio", "musicPrefs.genres") → form keys. */
export function fieldErrors(error: ApiError): Values {
  const out: Values = {};
  for (const [path, message] of Object.entries(error.fieldErrors)) out[path.split('.').pop() ?? path] = message;
  return out;
}
