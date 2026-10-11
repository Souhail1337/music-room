import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Text } from 'react-native-paper';
import { Artwork } from '../events/components';
import { tokens } from '../theme';
import { usePlayer, usePlayerStatus } from './PlayerProvider';

const c = tokens.colors;

/**
 * Sits above the tab bar while a preview is loaded: artwork, title, artist, play/pause, close and a
 * thin red progress line. Tapping it opens the full-screen player.
 */
export function MiniPlayer() {
  const { track } = usePlayer();
  if (!track) return null;
  return <MiniPlayerBar />;
}

function MiniPlayerBar() {
  const { track, loading, toggle, stop } = usePlayer();
  const { playing, progress } = usePlayerStatus();
  if (!track) return null;
  return (
    <View style={styles.bar}>
      <View style={styles.progressTrack} accessible={false}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable
          style={styles.open}
          onPress={() => router.push('/player')}
          android_ripple={{ color: c.surfaceOverlay }}
          accessibilityRole="button"
          accessibilityLabel={`${track.title} by ${track.artist}. Open player.`}
        >
          <Artwork uri={track.artworkUrl} size={40} rounded={4} />
          <View style={styles.text}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.title}>
              {track.title}
            </Text>
            <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
              {track.artist}
            </Text>
          </View>
        </Pressable>
        {loading ? (
          <View style={styles.spinner} accessibilityLabel="Loading preview">
            <ActivityIndicator size={20} color={c.inkPrimary} />
          </View>
        ) : (
          <IconButton
            icon={playing ? 'pause' : 'play'}
            iconColor={c.inkPrimary}
            size={28}
            onPress={toggle}
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          />
        )}
        <IconButton icon="close" iconColor={c.inkPrimary} size={24} onPress={stop} accessibilityLabel="Close player" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: c.surfaceRaised },
  progressTrack: { height: 2, backgroundColor: c.borderHairline },
  progressFill: { height: 2, backgroundColor: c.accent },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingRight: tokens.spacing[1] },
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingLeft: tokens.spacing[3],
    paddingVertical: tokens.spacing[2],
    minHeight: 56,
  },
  text: { flex: 1 },
  title: { color: c.inkPrimary, fontWeight: '600' },
  meta: { color: c.inkSecondary },
  spinner: { width: 48, height: 48, margin: 6, alignItems: 'center', justifyContent: 'center' },
});
