import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { useEventList, usePlaylistList } from '@/api/queries';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import { EmptyState } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { tokens } from '@/theme';
import { Logo } from '@/ui/components';
import { initial } from '@/ui/InviteSheet';
import { EventShelfCard, FilterChip, PlaylistShelfCard, Shelf, ShelfSkeleton } from '@/ui/shelf';

type Filter = 'all' | 'events' | 'playlists';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'events', label: 'Events' },
  { value: 'playlists', label: 'Playlists' },
];

/**
 * Home (was Discover): filter chips, then swipeable shelves of public events ("Live now" first)
 * and public playlists. Private ones never show here.
 */
export default function Home() {
  const [filter, setFilter] = useState<Filter>('all');
  const events = useEventList('discover', '');
  const playlists = usePlaylistList('discover', '');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([events.refetch(), playlists.refetch()]);
    setRefreshing(false);
  };

  const showEvents = filter !== 'playlists';
  const showPlaylists = filter !== 'events';
  const allEvents = events.data?.items ?? [];
  const live = allEvents.filter((e) => e.live);
  const notLive = allEvents.filter((e) => !e.live);
  const playlistItems = playlists.data?.items ?? [];
  const openEvent = (id: string) => router.push(`/events/${id}`);
  const openPlaylist = (id: string) => router.push(`/playlists/${id}`);

  return (
    <View style={styles.screen}>
      {/* Rendered as elements: the header calls these options as plain functions, and HomeActions uses hooks. */}
      <Stack.Screen options={{ headerTitle: () => <HomeTitle />, headerRight: () => <HomeActions /> }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[tokens.colors.accent]} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {FILTERS.map((f) => (
            <FilterChip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>

        {showEvents &&
          (events.isLoading ? (
            <ShelfSkeleton title="Live now" />
          ) : events.error ? (
            <EmptyState icon="alert-circle-outline" text={eventErrorText(events.error)} action={{ label: 'Retry', onPress: () => void events.refetch() }} />
          ) : allEvents.length === 0 ? (
            <View style={styles.block}>
              <Text variant="titleLarge" style={styles.heading}>
                Events
              </Text>
              <EmptyState
                icon="compass-outline"
                text="No public events right now. Create one."
                action={{ label: 'Create event', onPress: () => router.push('/events/new') }}
              />
            </View>
          ) : (
            <>
              {live.length > 0 && (
                <Shelf title="Live now" items={live} keyOf={(e) => e.id} renderCard={(e) => <EventShelfCard event={e} onPress={() => openEvent(e.id)} />} />
              )}
              {notLive.length > 0 && (
                <Shelf title="Events" items={notLive} keyOf={(e) => e.id} renderCard={(e) => <EventShelfCard event={e} onPress={() => openEvent(e.id)} />} />
              )}
            </>
          ))}

        {showPlaylists &&
          (playlists.isLoading ? (
            <ShelfSkeleton title="Playlists" />
          ) : playlists.error ? (
            <EmptyState
              icon="alert-circle-outline"
              text={eventErrorText(playlists.error)}
              action={{ label: 'Retry', onPress: () => void playlists.refetch() }}
            />
          ) : playlistItems.length === 0 ? (
            <View style={styles.block}>
              <Text variant="titleLarge" style={styles.heading}>
                Playlists
              </Text>
              <Text style={styles.none}>No public playlists yet.</Text>
            </View>
          ) : (
            <Shelf
              title="Playlists"
              items={playlistItems}
              keyOf={(p) => p.id}
              renderCard={(p) => <PlaylistShelfCard playlist={p} onPress={() => openPlaylist(p.id)} />}
            />
          ))}
      </ScrollView>
    </View>
  );
}

function HomeTitle() {
  return (
    <View style={styles.brand} accessibilityRole="header" accessibilityLabel="Music Room">
      <Logo size={28} />
      <Text variant="titleLarge" style={styles.brandText}>
        Music Room
      </Text>
    </View>
  );
}

function HomeActions() {
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });
  return (
    <View style={styles.actions}>
      <Appbar.Action icon="magnify" color={tokens.colors.inkPrimary} accessibilityLabel="Search" onPress={() => router.navigate('/search')} />
      <Pressable
        onPress={() => router.navigate('/profile')}
        style={styles.avatarHit}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
      >
        <Avatar.Text size={32} label={initial(me?.displayName ?? '')} color={tokens.colors.inkPrimary} style={styles.avatar} labelStyle={styles.avatarLabel} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  content: { paddingBottom: tokens.spacing[6], flexGrow: 1 },
  chips: { paddingHorizontal: tokens.spacing.margin, gap: tokens.spacing[2], paddingVertical: tokens.spacing[2] },
  block: { paddingHorizontal: tokens.spacing.margin, marginTop: tokens.spacing[5] },
  heading: { color: tokens.colors.inkPrimary, fontWeight: '700' },
  none: { color: tokens.colors.inkSecondary, paddingVertical: tokens.spacing[3] },
  brand: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  brandText: { color: tokens.colors.inkPrimary, fontWeight: '700', letterSpacing: -0.5 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  avatarHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  avatar: { backgroundColor: tokens.colors.surfaceOverlay },
  avatarLabel: { fontSize: 14 },
});
