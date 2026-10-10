import { AccessResource, AccessService, haversineM } from './access.service.js';

const HOST = 'host';
const PARIS = { lat: 48.8566, lng: 2.3522 };

function resource(overrides: Partial<AccessResource> = {}): AccessResource {
  return {
    hostId: HOST,
    visibility: 'PUBLIC',
    license: 'EVERYONE',
    lat: null,
    lng: null,
    radiusM: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

const onSite = (overrides: Partial<AccessResource> = {}) =>
  resource({
    license: 'ON_SITE',
    lat: PARIS.lat,
    lng: PARIS.lng,
    radiusM: 100,
    startsAt: new Date('2026-10-10T16:00:00Z'),
    endsAt: new Date('2026-10-10T18:00:00Z'),
    ...overrides,
  });

describe('AccessService', () => {
  const access = new AccessService();
  const guest = { userId: 'guest', invited: false };
  const invitee = { userId: 'guest', invited: true };
  const host = { userId: HOST, invited: false };
  const inWindow = new Date('2026-10-10T17:00:00Z');

  describe('haversineM', () => {
    it('is 0 for the same point and ~111 km per degree of latitude', () => {
      expect(haversineM(PARIS, PARIS)).toBe(0);
      expect(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(
        111_195,
        -2,
      );
    });
  });

  describe('canView', () => {
    it('public: everyone', () => {
      expect(access.canView(guest, resource())).toBe(true);
    });
    it('private: host and invitees only', () => {
      const r = resource({ visibility: 'PRIVATE' });
      expect(access.canView(guest, r)).toBe(false);
      expect(access.canView(invitee, r)).toBe(true);
      expect(access.canView(host, r)).toBe(true);
    });
  });

  describe('canAct', () => {
    it('EVERYONE allows any viewer', () => {
      expect(access.canAct(guest, resource()).allowed).toBe(true);
    });

    it('INVITED refuses non-invited users with NOT_INVITED', () => {
      const r = resource({ license: 'INVITED' });
      expect(access.canAct(guest, r)).toEqual({
        allowed: false,
        reason: 'NOT_INVITED',
      });
      expect(access.canAct(invitee, r).allowed).toBe(true);
    });

    it('the host always passes, even off-site and out of the window', () => {
      expect(
        access.canAct(host, onSite(), { now: new Date('2030-01-01Z') }).allowed,
      ).toBe(true);
    });

    it('ON_SITE: inside the radius and window is allowed', () => {
      const ctx = { lat: 48.857, lng: 2.3525, now: inWindow }; // ~50 m away
      expect(access.canAct(guest, onSite(), ctx).allowed).toBe(true);
    });

    it('ON_SITE: outside the radius → OUTSIDE_AREA', () => {
      const ctx = { lat: 48.8666, lng: 2.3522, now: inWindow }; // ~1.1 km away
      expect(access.canAct(guest, onSite(), ctx).reason).toBe('OUTSIDE_AREA');
    });

    it('ON_SITE: before or after the window → OUTSIDE_TIME_WINDOW (checked first)', () => {
      expect(
        access.canAct(guest, onSite(), {
          ...PARIS,
          now: new Date('2026-10-10T15:59:59Z'),
        }).reason,
      ).toBe('OUTSIDE_TIME_WINDOW');
      expect(
        access.canAct(guest, onSite(), {
          now: new Date('2026-10-10T18:00:01Z'),
        }).reason,
      ).toBe('OUTSIDE_TIME_WINDOW');
    });

    it('ON_SITE: no location → LOCATION_REQUIRED', () => {
      expect(access.canAct(guest, onSite(), { now: inWindow }).reason).toBe(
        'LOCATION_REQUIRED',
      );
    });

    it('private + not invited is refused even with EVERYONE', () => {
      expect(
        access.canAct(guest, resource({ visibility: 'PRIVATE' })).reason,
      ).toBe('NOT_INVITED');
    });
  });

  describe('assertCanAct', () => {
    it('throws the matching error codes', () => {
      const code = (fn: () => void) => {
        try {
          fn();
        } catch (e) {
          return (e as { code: string }).code;
        }
        return null;
      };
      expect(
        code(() =>
          access.assertCanAct(guest, resource({ license: 'INVITED' })),
        ),
      ).toBe('NOT_INVITED');
      expect(
        code(() => access.assertCanAct(guest, onSite(), { now: inWindow })),
      ).toBe('LOCATION_REQUIRED');
      expect(code(() => access.assertCanAct(guest, resource()))).toBeNull();
    });
  });
});
