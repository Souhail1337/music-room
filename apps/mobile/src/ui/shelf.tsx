import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { EventSummary } from '../api/events';
import type { PlaylistSummary } from '../api/playlists';
import { Artwork, LiveBadge } from '../events/components';
import { tokens } from '../theme';

const c = tokens.colors;
export const SHELF_CARD = 148;

/** A titled, horizontally swipeable row of square cards (no auto-play, no carousel paging). */
export function Shelf<T>({
  title,
  items,
  keyOf,
  renderCard,
}: {
  title: string;
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T) => ReactNode;
}) {
  return (
    <View style={styles.shelf}>
      <Text variant="titleLarge" style={styles.shelfTitle} accessibilityRole="header">
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={keyOf}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.shelfRow}
        renderItem={({ item }) => <>{renderCard(item)}</>}
      />
    </View>
  );
}

/** Square-artwork card: artwork on top, a bold title and a meta line under it. */
function SquareCard({
  artworkUrl,
  title,
  meta,
  badge,
  onPress,
  accessibilityLabel,
}: {
  artworkUrl: string | null;
  title: string;
  meta: string;
  badge?: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View>
        <Artwork uri={artworkUrl} size={SHELF_CARD} rounded={tokens.rounded.sm} />
        {badge && <View style={styles.badge}>{badge}</View>}
      </View>
      <Text variant="titleSmall" numberOfLines={2} style={styles.title}>
        {title}
      </Text>
      <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
        {meta}
      </Text>
    </Pressable>
  );
}

export function EventShelfCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  return (
    <SquareCard
      artworkUrl={event.nowPlaying?.artworkUrl ?? null}
      title={event.name}
      meta={`${event.host.displayName} · ${event.listeners} listening`}
      badge={event.live ? <LiveBadge /> : undefined}
      onPress={onPress}
      accessibilityLabel={`${event.name}, hosted by ${event.host.displayName}${event.live ? ', live' : ''}`}
    />
  );
}

export function PlaylistShelfCard({ playlist, onPress }: { playlist: PlaylistSummary; onPress: () => void }) {
  return (
    <SquareCard
      artworkUrl={playlist.artworkUrl}
      title={playlist.name}
      meta={`${playlist.owner.displayName} · ${playlist.trackCount} ${playlist.trackCount === 1 ? 'track' : 'tracks'}`}
      onPress={onPress}
      accessibilityLabel={`${playlist.name}, by ${playlist.owner.displayName}, ${playlist.trackCount} tracks`}
    />
  );
}

/** Loading placeholder for a shelf. */
export function ShelfSkeleton({ title }: { title: string }) {
  return (
    <View style={styles.shelf} accessibilityLabel="Loading">
      <Text variant="titleLarge" style={styles.shelfTitle}>
        {title}
      </Text>
      <View style={[styles.shelfRow, styles.skeletonRow]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card}>
            <View style={styles.skeletonArt} />
            <View style={[styles.skeletonLine, { width: '80%' }]} />
            <View style={[styles.skeletonLine, { width: '50%' }]} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Single-select filter pill (YouTube Music home chips). */
export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[styles.chip, selected && styles.chipSelected]}
      accessibilityRole="button"
      accessibilityLabel={`Show ${label}`}
      accessibilityState={{ selected }}
    >
      <Text variant="labelLarge" style={selected ? styles.chipTextSelected : styles.chipText}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: { gap: tokens.spacing[3], marginTop: tokens.spacing[5] },
  shelfTitle: { color: c.inkPrimary, fontWeight: '700', paddingHorizontal: tokens.spacing.margin },
  shelfRow: { paddingHorizontal: tokens.spacing.margin, gap: tokens.spacing[3] },
  card: { width: SHELF_CARD, gap: tokens.spacing[1] },
  pressed: { opacity: 0.7 },
  badge: { position: 'absolute', top: tokens.spacing[2], left: tokens.spacing[2] },
  title: { color: c.inkPrimary, marginTop: tokens.spacing[1] },
  meta: { color: c.inkSecondary },
  skeletonRow: { flexDirection: 'row', overflow: 'hidden' },
  skeletonArt: { width: SHELF_CARD, height: SHELF_CARD, borderRadius: tokens.rounded.sm, backgroundColor: c.surfaceRaised },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: c.surfaceRaised, marginTop: tokens.spacing[1] },
  chip: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing[3],
    borderRadius: tokens.rounded.sm,
    backgroundColor: c.surfaceOverlay,
    borderWidth: 1,
    borderColor: c.borderHairline,
  },
  chipSelected: { backgroundColor: c.inkPrimary, borderColor: c.inkPrimary },
  chipText: { color: c.inkPrimary },
  chipTextSelected: { color: c.surfaceBase },
});
