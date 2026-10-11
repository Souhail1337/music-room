import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, errorMessage } from '../api/errors';
import { musicApi, type Track } from '../api/music';
import { useAuth } from '../auth/AuthProvider';
import { useSnackbar } from '../ui/Snackbar';
import { audioFocus } from './audioFocus';

interface PlayerContextValue {
  /** The track in the mini-player, or null when the player is closed. */
  track: Track | null;
  /** True while the fresh preview URL is being fetched. */
  loading: boolean;
  play(track: Track): void;
  toggle(): void;
  stop(): void;
  seek(seconds: number): void;
  /** The underlying expo-audio player, for status subscriptions (`usePlayerStatus`). */
  audio: AudioPlayer;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/** Short, friendly messages for preview failures (EXPERIENCE.md voice). */
function previewErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PREVIEW_UNAVAILABLE' || error.code === 'TRACK_NOT_FOUND') return 'No preview for this track.';
    if (error.code === 'MUSIC_UNAVAILABLE') return 'Music search is unavailable right now.';
  }
  return errorMessage(error);
}

/**
 * The app-wide standalone player (Search tab): plays Deezer 30-second previews, fetched fresh from
 * the API right before playing and never stored (AD-8). No queue: a preview that ends stops there.
 * Shares audio focus with the event host's player so only one source is ever heard.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const audio = useAudioPlayer(null, { updateInterval: 250 });
  const { show } = useSnackbar();
  const { status } = useAuth();
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(false);
  // Every play() bumps the request id so a slow, superseded preview fetch is dropped.
  const requestId = useRef(0);

  const pauseForFocus = useCallback(() => audio.pause(), [audio]);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
    return () => audioFocus.release(pauseForFocus);
  }, [pauseForFocus]);

  const start = useCallback(() => {
    audioFocus.claim('standalone', pauseForFocus);
    audio.play();
  }, [audio, pauseForFocus]);

  const stop = useCallback(() => {
    requestId.current += 1;
    audio.pause();
    audioFocus.release(pauseForFocus);
    setTrack(null);
    setLoading(false);
  }, [audio, pauseForFocus]);

  const play = useCallback(
    (next: Track) => {
      const id = ++requestId.current;
      audio.pause();
      setTrack(next);
      setLoading(true);
      musicApi
        .preview(next.id)
        .then(({ previewUrl }) => {
          if (id !== requestId.current) return;
          audio.replace({ uri: previewUrl });
          start();
          setLoading(false);
        })
        .catch((error: unknown) => {
          if (id !== requestId.current) return;
          setLoading(false);
          setTrack(null);
          show(previewErrorText(error));
        });
    },
    [audio, start, show],
  );

  const toggle = useCallback(() => {
    if (!track || loading) return;
    if (audio.playing) {
      audio.pause();
      return;
    }
    // A preview that played to the end starts over.
    if (audio.duration > 0 && audio.currentTime >= audio.duration - 0.25) void audio.seekTo(0).catch(() => undefined);
    start();
  }, [audio, track, loading, start]);

  const seek = useCallback(
    (seconds: number) => {
      void audio.seekTo(Math.max(0, seconds)).catch(() => undefined);
    },
    [audio],
  );

  // Logging out (or the session ending) stops the audio and clears the player.
  const signedIn = status === 'signedIn';
  useEffect(() => {
    // Reacting to the auth state machine (an external transition) by clearing local player state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!signedIn) stop();
  }, [signedIn, stop]);

  const value = useMemo<PlayerContextValue>(
    () => ({ track, loading, play, toggle, stop, seek, audio }),
    [track, loading, play, toggle, stop, seek, audio],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

/** Live playback status (playing, currentTime, duration). Only the components that show it re-render. */
export function usePlayerStatus() {
  const { audio } = usePlayer();
  const status = useAudioPlayerStatus(audio);
  return {
    playing: status.playing,
    currentTime: status.currentTime,
    duration: status.duration,
    progress: status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0,
  };
}
