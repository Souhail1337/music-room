import * as Location from 'expo-location';
import { useEffect, useSyncExternalStore } from 'react';
import type { Coords } from './api/events';

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

interface LocationState {
  status: LocationStatus;
  coords: Coords | null;
}

/**
 * The device position for on-site events. The app only *sends* it: the server decides whether the
 * user is at the venue (AD-5). Watching is ref-counted so the event screen and the track search
 * sheet share one subscription.
 */
class LocationStore {
  private state: LocationState = { status: 'idle', coords: null };
  private readonly listeners = new Set<() => void>();
  private users = 0;
  private watch: Location.LocationSubscription | null = null;
  private starting: Promise<void> | null = null;

  getState = (): LocationState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  acquire(): () => void {
    this.users += 1;
    if (this.users === 1) void this.start();
    return () => {
      this.users -= 1;
      if (this.users === 0) this.stop();
    };
  }

  /** Re-asks (e.g. after the user comes back from Android settings). */
  async retry(): Promise<void> {
    this.stop();
    if (this.users > 0) await this.start();
  }

  private async start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      this.set({ status: 'requesting' });
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          this.set({ status: 'denied', coords: null });
          return;
        }
        const last = await Location.getLastKnownPositionAsync().catch(() => null);
        if (last) this.set({ status: 'granted', coords: { lat: last.coords.latitude, lng: last.coords.longitude } });
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 10, timeInterval: 5000 },
          (pos) => this.set({ status: 'granted', coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        );
        if (this.users === 0) sub.remove();
        else this.watch = sub;
        if (!this.state.coords) this.set({ status: 'granted' });
      } catch {
        this.set({ status: 'unavailable' });
      } finally {
        this.starting = null;
      }
    })();
    return this.starting;
  }

  private stop(): void {
    this.watch?.remove();
    this.watch = null;
  }

  private set(next: Partial<LocationState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }
}

export const locationStore = new LocationStore();

/** Watches the position while `enabled` (on-site events, non-host). */
export function useLocation(enabled: boolean): LocationState {
  useEffect(() => (enabled ? locationStore.acquire() : undefined), [enabled]);
  const state = useSyncExternalStore(locationStore.subscribe, locationStore.getState);
  return enabled ? state : { status: 'idle', coords: null };
}

/** One-shot position for "Use my current location" on the event form. Null if refused. */
export async function currentPosition(): Promise<Coords | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
