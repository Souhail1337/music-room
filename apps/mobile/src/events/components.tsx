import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, ProgressBar, Text, TouchableRipple } from 'react-native-paper';
import type { EventSummary } from '../api/events';
import type { Track } from '../api/music';
import { tokens } from '../theme';
import { PrimaryButton, SecondaryButton } from '../ui/components';
import { licenseLabel } from './copy';

const c = tokens.colors;

export function Artwork({ uri, size = 48, rounded = tokens.rounded.sm }: { uri: string | null; size?: number; rounded?: number }) {
  return uri ? (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: rounded, backgroundColor: c.surfaceOverlay }}
      contentFit="cover"
      transition={150}
      accessible={false}
    />
  ) : (
    <View style={[styles.artFallback, { width: size, height: size, borderRadius: rounded }]}>
      <MaterialCommunityIcons name="music-note" size={size * 0.5} color={c.inkDisabled} />
    </View>
  );
}

/** 48px artwork, title (body) over artist (meta), and a trailing slot (DESIGN.md Track row). */
export function TrackRow({
  track,
  trailing,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  track: Track;
  trailing?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (
    <View style={styles.row}>
      <Artwork uri={track.artworkUrl} />
      <View style={styles.rowText}>
        <Text variant="bodyLarge" numberOfLines={1}>
          {track.title}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
          {track.artist}
        </Text>
      </View>
      {trailing}
    </View>
  );
  if (!onPress) return body;
  return (
    <TouchableRipple
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${track.title} by ${track.artist}`}
      accessibilityState={{ disabled: !!disabled }}
    >
      {body}
    </TouchableRipple>
  );
}

/** Up arrow + count. Green means exactly "you voted for this track". 48dp hit area. */
export function VoteButton({
  count,
  voted,
  disabled,
  onPress,
  title,
}: {
  count: number;
  voted: boolean;
  disabled?: boolean;
  onPress: () => void;
  title: string;
}) {
  const color = disabled ? c.inkDisabled : voted ? c.voteActive : c.inkSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={styles.vote}
      accessibilityRole="button"
      accessibilityLabel={`Vote for ${title}, ${count} ${count === 1 ? 'vote' : 'votes'}${voted ? ', voted' : ''}`}
      accessibilityState={{ disabled: !!disabled, selected: voted }}
    >
      <MaterialCommunityIcons name={voted ? 'arrow-up-bold' : 'arrow-up-bold-outline'} size={24} color={color} />
      <Text variant="bodySmall" style={{ color }}>
        {count}
      </Text>
    </Pressable>
  );
}

export function Chip({ label, icon }: { label: string; icon?: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return (
    <View style={styles.chip}>
      {icon && <MaterialCommunityIcons name={icon} size={14} color={c.inkSecondary} />}
      <Text variant="labelMedium" style={styles.meta}>
        {label}
      </Text>
    </View>
  );
}

export function LiveBadge() {
  return (
    <View style={styles.live} accessibilityLabel="Live">
      <Text variant="labelSmall" style={styles.liveText}>
        LIVE
      </Text>
    </View>
  );
}

/** Event card for Discover / Events: cover, name, host + listeners, LIVE, visibility chip. */
export function EventCard({ event, onPress }: { event: EventSummary; onPress: () => void }) {
  return (
    <TouchableRipple
      onPress={onPress}
      style={styles.card}
      borderless
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, hosted by ${event.host.displayName}${event.live ? ', live' : ''}`}
    >
      <View style={styles.cardInner}>
        <Artwork uri={event.nowPlaying?.artworkUrl ?? null} size={64} />
        <View style={styles.rowText}>
          <View style={styles.titleLine}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.flex}>
              {event.name}
            </Text>
            {event.live && <LiveBadge />}
          </View>
          <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
            {event.host.displayName} · {event.listeners} listening
          </Text>
          <View style={styles.chips}>
            <Chip label={event.visibility === 'public' ? 'Public' : 'Private'} />
            <Chip label={licenseLabel(event.license, event.startsAt, event.endsAt)} />
          </View>
        </View>
      </View>
    </TouchableRipple>
  );
}

/** The anchor of the event screen. The host sees Play/Pause and Skip. Not votable. */
export function NowPlayingCard({
  nowPlaying,
  progress,
  host,
}: {
  nowPlaying: { track: Track } | null;
  progress: number;
  host?: {
    playing: boolean;
    busy: boolean;
    canStart: boolean;
    disabled: boolean;
    onPlayPause: () => void;
    onSkip: () => void;
  };
}) {
  return (
    <View style={styles.nowPlaying} accessibilityLabel={nowPlaying ? `Now playing: ${nowPlaying.track.title} by ${nowPlaying.track.artist}` : 'Nothing playing yet'}>
      <View style={styles.nowRow}>
        <Artwork uri={nowPlaying?.track.artworkUrl ?? null} size={96} rounded={tokens.rounded.md} />
        <View style={styles.rowText}>
          <Text variant="labelMedium" style={styles.meta}>
            Now playing
          </Text>
          <Text variant="headlineMedium" numberOfLines={2}>
            {nowPlaying?.track.title ?? 'Nothing yet'}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
            {nowPlaying?.track.artist ?? (host ? 'Tap Play to start the top track.' : 'The host starts the music.')}
          </Text>
        </View>
      </View>
      {nowPlaying && <ProgressBar progress={Math.min(1, Math.max(0, progress))} color={c.accent} style={styles.progress} />}
      {host && (
        <View style={styles.controls}>
          <IconButton
            icon={host.playing ? 'pause' : 'play'}
            mode="contained"
            size={28}
            containerColor={c.accent}
            iconColor={c.onAccent}
            disabled={host.disabled || host.busy || (!nowPlaying && !host.canStart)}
            onPress={host.onPlayPause}
            accessibilityLabel={host.playing ? 'Pause' : 'Play'}
          />
          <IconButton
            icon="skip-next"
            size={28}
            iconColor={c.inkPrimary}
            disabled={host.disabled || host.busy || !nowPlaying}
            onPress={host.onSkip}
            accessibilityLabel="Skip"
          />
        </View>
      )}
    </View>
  );
}

/** Permission / license problem above the queue: warning text color, never a red fill. */
export function Notice({ text, action }: { text: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.notice} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={c.warning} />
      <Text variant="bodyMedium" style={styles.noticeText}>
        {text}
      </Text>
      {action && (
        <SecondaryButton compact onPress={action.onPress} contentStyle={styles.noticeButton}>
          {action.label}
        </SecondaryButton>
      )}
    </View>
  );
}

/** Thin warning bar while the socket is down; actions are disabled meanwhile. */
export function ReconnectingBar() {
  return (
    <View style={styles.reconnecting} accessibilityLiveRegion="polite">
      <Text variant="labelMedium" style={{ color: c.surfaceBase }}>
        Reconnecting…
      </Text>
    </View>
  );
}

export function SkeletonRows({ count = 4, height = 64 }: { count?: number; height?: number }) {
  return (
    <View accessibilityLabel="Loading" style={styles.skeletons}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.skeletonRow, { height }]}>
          <View style={styles.skeletonArt} />
          <View style={styles.flex}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, { width: '40%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  text,
  action,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={48} color={c.inkDisabled} />
      <Text variant="bodyLarge" style={styles.emptyText}>
        {text}
      </Text>
      {action && (
        <PrimaryButton onPress={action.onPress} disabled={action.disabled}>
          {action.label}
        </PrimaryButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  meta: { color: c.inkSecondary },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: tokens.spacing[2], paddingVertical: tokens.spacing[1] },
  rowText: { flex: 1, justifyContent: 'center' },
  artFallback: { backgroundColor: c.surfaceOverlay, alignItems: 'center', justifyContent: 'center' },
  vote: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.surfaceOverlay,
    borderRadius: tokens.rounded.full,
    paddingHorizontal: tokens.spacing[2],
    paddingVertical: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1], marginTop: tokens.spacing[1] },
  live: { backgroundColor: c.live, borderRadius: tokens.rounded.full, paddingHorizontal: tokens.spacing[2], paddingVertical: 1 },
  liveText: { color: c.onAccent },
  card: { backgroundColor: c.surfaceRaised, borderRadius: tokens.rounded.md },
  cardInner: { flexDirection: 'row', gap: tokens.spacing[3], padding: tokens.spacing[3], alignItems: 'center' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  nowPlaying: { backgroundColor: c.surfaceRaised, borderRadius: tokens.rounded.lg, padding: tokens.spacing[4], gap: tokens.spacing[3] },
  nowRow: { flexDirection: 'row', gap: tokens.spacing[3], alignItems: 'center' },
  progress: { height: 3, borderRadius: 2, backgroundColor: c.surfaceOverlay },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: tokens.spacing[4] },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing[2],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.borderHairline,
  },
  noticeText: { color: c.warning, flex: 1, minWidth: 180 },
  noticeButton: { height: 40 },
  reconnecting: { backgroundColor: c.warning, alignItems: 'center', paddingVertical: 2 },
  skeletons: { gap: tokens.spacing[2] },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  skeletonArt: { width: 48, height: 48, borderRadius: tokens.rounded.sm, backgroundColor: c.surfaceRaised },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: c.surfaceRaised, marginVertical: 4 },
  empty: { alignItems: 'center', gap: tokens.spacing[3], paddingVertical: tokens.spacing[6] },
  emptyText: { color: c.inkSecondary, textAlign: 'center' },
});
