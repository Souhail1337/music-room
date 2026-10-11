/**
 * One audio source at a time. The standalone player (Search) and the event host's player both
 * claim focus right before they start playing; claiming pauses whoever held it before.
 */
export type AudioOwner = 'standalone' | 'host';

interface Holder {
  owner: AudioOwner;
  pause: () => void;
}

let holder: Holder | null = null;

export const audioFocus = {
  /** Take focus for `owner`; the previous holder (if another one) is paused. */
  claim(owner: AudioOwner, pause: () => void) {
    const previous = holder;
    holder = { owner, pause };
    if (previous && previous.pause !== pause) {
      try {
        previous.pause();
      } catch {
        // The previous player may already be released (screen unmounted).
      }
    }
  },
  /** Give focus back, but only if `pause` still holds it. */
  release(pause: () => void) {
    if (holder?.pause === pause) holder = null;
  },
};
