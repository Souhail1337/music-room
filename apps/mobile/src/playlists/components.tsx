import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Avatar, IconButton, Menu, Text, TouchableRipple } from 'react-native-paper';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { PlaylistEntry, PlaylistSummary } from '../api/playlists';
import type { UserRef } from '../api/users';
import { Artwork, Chip, TrackRow } from '../events/components';
import { tokens } from '../theme';
import { initial } from '../ui/InviteSheet';
import { playlistLicenseLabel } from './copy';

const c = tokens.colors;

/** Up to `max` overlapping initials avatars, plus "+n". */
export function AvatarStack({ users, max = 3, size = 28 }: { users: UserRef[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <View style={styles.stack}>
      {shown.map((u, i) => (
        <Avatar.Text
          key={u.id}
          size={size}
          label={initial(u.displayName)}
          color={c.inkPrimary}
          style={[styles.stackAvatar, { marginLeft: i === 0 ? 0 : -size / 3 }]}
          labelStyle={{ fontSize: size * 0.45 }}
        />
      ))}
      {extra > 0 && (
        <Text variant="labelSmall" style={styles.meta}>
          {` +${extra}`}
        </Text>
      )}
    </View>
  );
}

/** Header presence: who has the playlist open now. Tap to see the list. */
export function PresenceAvatars({ viewers }: { viewers: UserRef[] }) {
  const [open, setOpen] = useState(false);
  if (viewers.length === 0) return null;
  const names = viewers.map((v) => v.displayName).join(', ');
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={
        <Pressable
          onPress={() => setOpen(true)}
          style={styles.presence}
          accessibilityRole="button"
          accessibilityLabel={`${viewers.length} ${viewers.length === 1 ? 'person' : 'people'} here: ${names}`}
        >
          <AvatarStack users={viewers} />
        </Pressable>
      }
    >
      <Menu.Item title="Here now" disabled titleStyle={styles.meta} />
      {viewers.map((v) => (
        <Menu.Item key={v.id} leadingIcon="account-circle-outline" title={v.displayName} />
      ))}
    </Menu>
  );
}

/** Playlist card: like the event card, plus up to 3 collaborator avatars (DESIGN.md). */
export function PlaylistCard({ playlist, onPress }: { playlist: PlaylistSummary; onPress: () => void }) {
  return (
    <TouchableRipple
      onPress={onPress}
      style={styles.card}
      borderless
      accessibilityRole="button"
      accessibilityLabel={`${playlist.name}, by ${playlist.owner.displayName}, ${playlist.trackCount} tracks`}
    >
      <View style={styles.cardInner}>
        <Artwork uri={playlist.artworkUrl} size={64} />
        <View style={styles.flex}>
          <Text variant="titleMedium" numberOfLines={1}>
            {playlist.name}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={styles.meta}>
            {playlist.owner.displayName} · {playlist.trackCount} {playlist.trackCount === 1 ? 'track' : 'tracks'}
          </Text>
          <View style={styles.chips}>
            <Chip label={playlist.visibility === 'public' ? 'Public' : 'Private'} />
            <Chip label={playlistLicenseLabel(playlist.license)} />
          </View>
        </View>
        <AvatarStack users={playlist.collaborators} size={24} />
      </View>
    </TouchableRipple>
  );
}

export const ROW_HEIGHT = 72;

interface DragState {
  active: SharedValue<number>;
  hover: SharedValue<number>;
  dragY: SharedValue<number>;
  dropping: SharedValue<boolean>;
}

/**
 * The editable track list (EXPERIENCE.md): long-press the drag handle to reorder, swipe left or
 * use the overflow menu to remove, and "Move up" / "Move down" in the overflow menu as the
 * no-drag alternative. Read-only lists hide handles and menus.
 */
export function EditableTrackList({
  entries,
  version,
  editable,
  onMove,
  onRemove,
}: {
  entries: PlaylistEntry[];
  /** The version of `entries`: every edit is sent with the version the user acted on (AD-3). */
  version: number;
  editable: boolean;
  onMove: (entry: PlaylistEntry, toIndex: number, baseVersion: number) => void;
  onRemove: (entry: PlaylistEntry, baseVersion: number) => void;
}) {
  const drag: DragState = {
    active: useSharedValue(-1),
    hover: useSharedValue(-1),
    dragY: useSharedValue(0),
    dropping: useSharedValue(false),
  };
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  // A drop keeps the row where it was released until the reordered list arrives.
  const { active, hover, dragY, dropping } = drag;
  useEffect(() => {
    active.set(-1);
    hover.set(-1);
    dragY.set(0);
    dropping.set(false);
  }, [entries, active, hover, dragY, dropping]);

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const drop = (from: number, to: number, baseVersion: number) => {
    const entry = entries[from];
    if (entry) onMove(entry, to, baseVersion);
    // Safety net: if nothing changes (e.g. the request never went out), put the rows back.
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      active.set(-1);
      hover.set(-1);
      dragY.set(0);
      dropping.set(false);
    }, 2000);
  };

  return (
    <View>
      {entries.map((entry, index) => (
        <EditableRow
          key={entry.id}
          entry={entry}
          index={index}
          count={entries.length}
          version={version}
          editable={editable}
          drag={drag}
          reduceMotion={reduceMotion}
          menuOpen={menuFor === entry.id}
          onMenu={(open) => setMenuFor(open ? entry.id : null)}
          onDrop={drop}
          onMove={(to, baseVersion) => onMove(entry, to, baseVersion)}
          onRemove={(baseVersion) => onRemove(entry, baseVersion)}
        />
      ))}
    </View>
  );
}

function EditableRow({
  entry,
  index,
  count,
  version,
  editable,
  drag,
  reduceMotion,
  menuOpen,
  onMenu,
  onDrop,
  onMove,
  onRemove,
}: {
  entry: PlaylistEntry;
  index: number;
  count: number;
  version: number;
  editable: boolean;
  drag: DragState;
  reduceMotion: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onDrop: (from: number, to: number, baseVersion: number) => void;
  onMove: (toIndex: number, baseVersion: number) => void;
  onRemove: (baseVersion: number) => void;
}) {
  const { active, hover, dragY, dropping } = drag;
  const swipeable = useRef<SwipeableMethods>(null);
  // The version of the list when the menu opened / the swipe started (AD-3).
  const menuVersion = useRef(version);
  const swipeVersion = useRef(version);
  const startVersion = useSharedValue(version);
  const title = entry.track.title;

  const pan = Gesture.Pan()
    .enabled(editable)
    .activateAfterLongPress(250)
    .onStart(() => {
      startVersion.set(version);
      active.set(index);
      hover.set(index);
      dragY.set(0);
    })
    .onUpdate((e) => {
      dragY.set(e.translationY);
      const target = Math.round(index + e.translationY / ROW_HEIGHT);
      hover.set(Math.max(0, Math.min(count - 1, target)));
    })
    .onEnd(() => {
      const to = hover.get();
      if (to >= 0 && to !== index) {
        dropping.set(true);
        dragY.set((to - index) * ROW_HEIGHT);
        scheduleOnRN(onDrop, index, to, startVersion.get());
      }
    })
    .onFinalize(() => {
      if (dropping.get()) return;
      active.set(-1);
      hover.set(-1);
      dragY.set(0);
    });

  const animated = useAnimatedStyle(() => {
    const a = active.get();
    const h = hover.get();
    if (a < 0) return { transform: [{ translateY: 0 }], zIndex: 0 };
    if (a === index) return { transform: [{ translateY: dragY.get() }], zIndex: 10 };
    let shift = 0;
    if (a < h && index > a && index <= h) shift = -ROW_HEIGHT;
    if (a > h && index < a && index >= h) shift = ROW_HEIGHT;
    return {
      transform: [{ translateY: reduceMotion ? shift : withTiming(shift, { duration: 150 }) }],
      zIndex: 0,
    };
  });

  const trailing = editable ? (
    <View style={styles.trailing}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.handle}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${title}. Long-press and drag, or use More options.`}
          accessibilityActions={[
            { name: 'increment', label: 'Move down' },
            { name: 'decrement', label: 'Move up' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'decrement' && index > 0) onMove(index - 1, version);
            if (e.nativeEvent.actionName === 'increment' && index < count - 1) onMove(index + 1, version);
          }}
        >
          <MaterialCommunityIcons name="drag-horizontal-variant" size={24} color={c.inkSecondary} />
        </View>
      </GestureDetector>
      <Menu
        visible={menuOpen}
        onDismiss={() => onMenu(false)}
        anchor={
          <IconButton
            icon="dots-vertical"
            iconColor={c.inkSecondary}
            onPress={() => {
              menuVersion.current = version;
              onMenu(true);
            }}
            accessibilityLabel={`More options for ${title}`}
          />
        }
      >
        <Menu.Item
          leadingIcon="arrow-up"
          title="Move up"
          disabled={index === 0}
          onPress={() => {
            onMenu(false);
            onMove(index - 1, menuVersion.current);
          }}
        />
        <Menu.Item
          leadingIcon="arrow-down"
          title="Move down"
          disabled={index === count - 1}
          onPress={() => {
            onMenu(false);
            onMove(index + 1, menuVersion.current);
          }}
        />
        <Menu.Item
          leadingIcon="delete-outline"
          title="Remove"
          onPress={() => {
            onMenu(false);
            onRemove(menuVersion.current);
          }}
        />
      </Menu>
    </View>
  ) : null;

  const row = (
    <View style={styles.rowBody}>
      <TrackRow track={entry.track} trailing={trailing} />
    </View>
  );

  return (
    <Animated.View style={[styles.rowWrap, animated]}>
      {editable ? (
        <ReanimatedSwipeable
          ref={swipeable}
          friction={2}
          rightThreshold={72}
          overshootRight={false}
          renderRightActions={() => (
            <View style={styles.swipeAction} accessibilityElementsHidden>
              <MaterialCommunityIcons name="delete-outline" size={22} color={c.error} />
              <Text variant="labelLarge" style={{ color: c.error }}>
                Remove
              </Text>
            </View>
          )}
          onSwipeableOpenStartDrag={() => {
            swipeVersion.current = version;
          }}
          onSwipeableOpen={() => {
            swipeable.current?.close();
            onRemove(swipeVersion.current);
          }}
        >
          {row}
        </ReanimatedSwipeable>
      ) : (
        row
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  meta: { color: c.inkSecondary },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackAvatar: { backgroundColor: c.surfaceOverlay, borderWidth: 2, borderColor: c.surfaceBase },
  presence: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: tokens.spacing[1] },
  card: { backgroundColor: c.surfaceRaised, borderRadius: tokens.rounded.md },
  cardInner: { flexDirection: 'row', gap: tokens.spacing[3], padding: tokens.spacing[3], alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1], marginTop: tokens.spacing[1] },
  rowWrap: { height: ROW_HEIGHT, backgroundColor: c.surfaceBase },
  rowBody: { height: ROW_HEIGHT, justifyContent: 'center', backgroundColor: c.surfaceBase },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  handle: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  swipeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    backgroundColor: c.surfaceOverlay,
    flex: 1,
  },
});
