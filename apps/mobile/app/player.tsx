import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Artwork } from '@/events/components';
import { usePlayer, usePlayerStatus } from '@/player/PlayerProvider';
import { tokens } from '@/theme';

const c = tokens.colors;

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Full-screen player: large artwork, title/artist, seek bar and play/pause. No queue. */
export default function PlayerScreen() {
  const { track, loading, toggle, seek } = usePlayer();
  const { playing, currentTime, duration } = usePlayerStatus();
  const { width } = useWindowDimensions();
  const art = Math.min(width - tokens.spacing.margin * 4, 360);

  // Closing the mini-player while this screen is open leaves nothing to show.
  useEffect(() => {
    if (!track && router.canGoBack()) router.back();
  }, [track]);

  if (!track) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <IconButton
          icon="chevron-down"
          iconColor={c.inkPrimary}
          size={28}
          onPress={() => router.back()}
          accessibilityLabel="Close full-screen player"
        />
        <Text variant="labelLarge" style={styles.meta}>
          Preview
        </Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.artWrap}>
          <Artwork uri={track.artworkUrl} size={art} rounded={tokens.rounded.sm} />
        </View>

        <View style={styles.titles}>
          <Text variant="headlineSmall" numberOfLines={2} style={styles.title}>
            {track.title}
          </Text>
          <Text variant="bodyLarge" numberOfLines={1} style={styles.meta}>
            {track.artist}
          </Text>
        </View>

        <SeekBar currentTime={currentTime} duration={duration} onSeek={seek} disabled={loading} />

        <View style={styles.controls}>
          {loading ? (
            <View style={styles.bigButton} accessibilityLabel="Loading preview">
              <ActivityIndicator size={32} color={c.inkPrimary} />
            </View>
          ) : (
            <IconButton
              icon={playing ? 'pause' : 'play'}
              mode="contained"
              containerColor={c.inkPrimary}
              iconColor={c.surfaceBase}
              size={40}
              style={styles.bigButton}
              onPress={toggle}
              accessibilityLabel={playing ? 'Pause' : 'Play'}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** A thin seek bar: tap or drag anywhere on it. TalkBack: swipe up/down to move 5 seconds. */
function SeekBar({
  currentTime,
  duration,
  onSeek,
  disabled,
}: {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
}) {
  const [barWidth, setBarWidth] = useState(0);
  // While the finger is down, show where it is rather than the playback position.
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const usable = duration > 0 && !disabled;
  const fraction = dragFraction ?? (duration > 0 ? Math.min(1, currentTime / duration) : 0);

  const at = (e: GestureResponderEvent) => (barWidth > 0 ? Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth)) : 0);

  return (
    <View style={styles.seek}>
      <View
        style={styles.seekHit}
        onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => usable}
        onMoveShouldSetResponder={() => usable}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDragFraction(at(e))}
        onResponderMove={(e) => setDragFraction(at(e))}
        onResponderRelease={(e) => {
          onSeek(at(e) * duration);
          setDragFraction(null);
        }}
        onResponderTerminate={() => setDragFraction(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ text: `${clock(currentTime)} of ${clock(duration)}` }}
        accessibilityActions={[
          { name: 'increment', label: 'Forward 5 seconds' },
          { name: 'decrement', label: 'Back 5 seconds' },
        ]}
        onAccessibilityAction={(e) => {
          if (!usable) return;
          const step = e.nativeEvent.actionName === 'increment' ? 5 : -5;
          onSeek(Math.min(duration, Math.max(0, currentTime + step)));
        }}
      >
        <View style={styles.seekTrack} pointerEvents="none">
          <View style={[styles.seekFill, { width: `${fraction * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { left: Math.max(0, fraction * barWidth - 7) }, dragFraction !== null && styles.thumbActive]}
        />
      </View>
      <View style={styles.times}>
        <Text variant="bodySmall" style={styles.meta}>
          {clock(dragFraction !== null ? dragFraction * duration : currentTime)}
        </Text>
        <Text variant="bodySmall" style={styles.meta}>
          {clock(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surfaceBase },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: tokens.spacing[1] },
  topSpacer: { width: 56 },
  body: { flex: 1, paddingHorizontal: tokens.spacing.margin * 2, justifyContent: 'center', gap: tokens.spacing[5] },
  artWrap: { alignItems: 'center' },
  titles: { gap: tokens.spacing[1] },
  title: { color: c.inkPrimary, fontWeight: '700' },
  meta: { color: c.inkSecondary },
  seek: { gap: tokens.spacing[1] },
  seekHit: { height: 48, justifyContent: 'center' },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: c.track, overflow: 'hidden' },
  seekFill: { height: 4, backgroundColor: c.accent },
  thumb: { position: 'absolute', top: 17, width: 14, height: 14, borderRadius: 7, backgroundColor: c.accent },
  thumbActive: { transform: [{ scale: 1.3 }] },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { alignItems: 'center' },
  bigButton: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
