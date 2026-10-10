import { Injectable } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';

export type Visibility = 'PUBLIC' | 'PRIVATE';
export type License = 'EVERYONE' | 'INVITED' | 'ON_SITE';

/**
 * What the policy needs to know about an Event or a Playlist. For a playlist, `hostId` is the
 * owner, the license is `EVERYONE | INVITED`, and the venue / window fields are null.
 */
export interface AccessResource {
  /** Defaults to `event`. A playlist refuses non-editors with `READ_ONLY` instead of `NOT_INVITED`. */
  kind?: 'event' | 'playlist';
  hostId: string;
  visibility: Visibility;
  license: License;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
}

/** Who is asking, and whether they are on the resource's invite list. */
export interface Viewer {
  userId: string;
  invited: boolean;
}

export interface ActContext {
  lat?: number;
  lng?: number;
  now?: Date;
}

export type DenyReason =
  | 'NOT_INVITED'
  | 'OUTSIDE_AREA'
  | 'OUTSIDE_TIME_WINDOW'
  | 'LOCATION_REQUIRED'
  | 'READ_ONLY';

export type ActDecision =
  { allowed: true; reason: null } | { allowed: false; reason: DenyReason };

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in meters. */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ALLOWED: ActDecision = { allowed: true, reason: null };
const deny = (reason: DenyReason): ActDecision => ({ allowed: false, reason });

/**
 * The single access policy (AD-4), used by REST controllers and by the socket `join` handler.
 * The host always passes. A private resource is invisible (404) to anyone who can't view it.
 */
@Injectable()
export class AccessService {
  canView(viewer: Viewer, resource: AccessResource): boolean {
    if (viewer.userId === resource.hostId) return true;
    return resource.visibility === 'PUBLIC' || viewer.invited;
  }

  /**
   * Whether the viewer may vote / suggest (events) or edit the track list (playlists).
   * On-site is checked here, in UTC (AD-5).
   */
  canAct(
    viewer: Viewer,
    resource: AccessResource,
    ctx: ActContext = {},
  ): ActDecision {
    if (viewer.userId === resource.hostId) return ALLOWED;
    const refused = resource.kind === 'playlist' ? 'READ_ONLY' : 'NOT_INVITED';
    if (!this.canView(viewer, resource)) return deny(refused);
    switch (resource.license) {
      case 'EVERYONE':
        return ALLOWED;
      case 'INVITED':
        return viewer.invited ? ALLOWED : deny(refused);
      case 'ON_SITE': {
        const now = (ctx.now ?? new Date()).getTime();
        if (
          (resource.startsAt && now < resource.startsAt.getTime()) ||
          (resource.endsAt && now > resource.endsAt.getTime())
        )
          return deny('OUTSIDE_TIME_WINDOW');
        if (
          resource.lat === null ||
          resource.lng === null ||
          resource.radiusM === null
        )
          return deny('OUTSIDE_AREA');
        if (
          typeof ctx.lat !== 'number' ||
          typeof ctx.lng !== 'number' ||
          !Number.isFinite(ctx.lat) ||
          !Number.isFinite(ctx.lng)
        )
          return deny('LOCATION_REQUIRED');
        const distance = haversineM(
          { lat: ctx.lat, lng: ctx.lng },
          { lat: resource.lat, lng: resource.lng },
        );
        return distance <= resource.radiusM ? ALLOWED : deny('OUTSIDE_AREA');
      }
    }
  }

  /** Throws the matching 403 / 400 when the viewer may not act. */
  assertCanAct(
    viewer: Viewer,
    resource: AccessResource,
    ctx: ActContext = {},
  ): void {
    const decision = this.canAct(viewer, resource, ctx);
    if (decision.allowed) return;
    switch (decision.reason) {
      case 'NOT_INVITED':
        throw Errors.notInvited();
      case 'OUTSIDE_AREA':
        throw Errors.outsideArea();
      case 'OUTSIDE_TIME_WINDOW':
        throw Errors.outsideTimeWindow({
          startsAt: resource.startsAt?.toISOString() ?? null,
          endsAt: resource.endsAt?.toISOString() ?? null,
        });
      case 'LOCATION_REQUIRED':
        throw Errors.locationRequired();
      case 'READ_ONLY':
        throw Errors.readOnly();
    }
  }
}
