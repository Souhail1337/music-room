import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/errors';
import type { EventDetail } from '../api/events';
import { musicApi } from '../api/music';
import { useAdvance } from '../api/queries';
import { audioFocus } from '../player/audioFocus';

/** Deezer previews are 30 seconds long. */
export const PREVIEW_SECONDS = 30;

/**
 * Host-only playback (FR-16, AD-8, AD-9): play the 30-second preview of Now Playing, fetched fresh
 * just before playing; when it ends (or on Skip) ask the server to advance with the track we were
 * playing, then play whatever the server says is next. Other phones never play audio.
 * Shares audio focus with the standalone (Search) player: starting one pauses the other.
 */
export function useHostPlayer(eventId: string, detail: EventDetail | undefined, onMessage: (text: string) => void) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const advance = useAdvance(eventId);
  // Nothing plays until the host presses Play once on this screen.
  const [armed, setArmed] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // One audio source at a time: claim focus before every play; give it back when the screen goes.
  const pauseForFocus = useCallback(() => player.pause(), [player]);
  const start = useCallback(() => {
    audioFocus.claim('host', pauseForFocus);
    player.play();
  }, [player, pauseForFocus]);
  useEffect(() => () => audioFocus.release(pauseForFocus), [pauseForFocus]);

  const nowPlaying = detail?.nowPlaying ?? null;
  const nowId = nowPlaying?.track.id ?? null;
  // startedAt distinguishes the same track played twice.
  const nowKey = nowPlaying ? `${nowPlaying.track.id}@${nowPlaying.startedAt}` : null;
  const nowIdRef = useRef(nowId);
  useEffect(() => {
    nowIdRef.current = nowId;
  }, [nowId]);

  const { mutate: advanceMutate } = advance;
  const next = useCallback(
    (expected: string | null) =>
      advanceMutate(expected, { onError: (error) => onMessage(errorMessage(error)) }),
    [advanceMutate, onMessage],
  );

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
  }, []);

  // Load and play a fresh preview whenever Now Playing changes.
  useEffect(() => {
    if (!armed) return;
    if (!nowKey || !nowId) {
      player.pause();
      loadedFor.current = null;
      return;
    }
    if (loadedFor.current === nowKey) return;
    loadedFor.current = nowKey;
    let cancelled = false;
    musicApi
      .preview(nowId)
      .then(({ previewUrl }) => {
        if (cancelled) return;
        player.replace({ uri: previewUrl });
        start();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.code === 'PREVIEW_UNAVAILABLE' || error.code === 'TRACK_NOT_FOUND')) {
          onMessage('This track has no preview. Skipping.');
          next(nowId);
        } else {
          loadedFor.current = null;
          onMessage(errorMessage(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [armed, nowKey, nowId, player, start, next, onMessage]);

  // Auto-advance when the preview ends.
  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish && armed && nowIdRef.current) next(nowIdRef.current);
    });
    return () => sub.remove();
  }, [player, armed, next]);

  const playPause = useCallback(() => {
    if (!nowId) {
      setArmed(true);
      next(null);
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    if (status.playing) player.pause();
    else start();
  }, [nowId, armed, status.playing, player, start, next]);

  const skip = useCallback(() => {
    setArmed(true);
    next(nowId);
  }, [nowId, next]);

  return {
    playing: armed && status.playing,
    busy: advance.isPending,
    progress: armed && status.duration > 0 ? status.currentTime / status.duration : 0,
    playPause,
    skip,
  };
}

/** Listener-side progress: time since the server started the track, over the preview length. */
export function useElapsedProgress(startedAt: string | null, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled || !startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled, startedAt]);
  if (!startedAt) return 0;
  return Math.min(1, Math.max(0, (now - new Date(startedAt).getTime()) / (PREVIEW_SECONDS * 1000)));
}
