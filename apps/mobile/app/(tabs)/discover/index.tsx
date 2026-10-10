import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import type { EventSummary } from '@/api/events';
import type { PlaylistSummary } from '@/api/playlists';
import { useEventList, usePlaylistList } from '@/api/queries';
import { EmptyState, EventCard, SkeletonRows } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { PlaylistCard } from '@/playlists/components';
import { tokens } from '@/theme';
import { useDebounced } from '@/ui/useDebounced';

type Row = { kind: 'event'; item: EventSummary } | { kind: 'playlist'; item: PlaylistSummary };

/** Discover: search, then public events (live first) and public playlists. Private ones never show here. */
export default function Discover() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const events = useEventList('discover', q);
  const playlists = usePlaylistList('discover', q);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([events.refetch(), playlists.refetch()]);
    setRefreshing(false);
  };

  const sections: { key: 'events' | 'playlists'; title: string; data: Row[] }[] = [
    { key: 'events', title: 'Events', data: (events.data?.items ?? []).map((item) => ({ kind: 'event', item })) },
    { key: 'playlists', title: 'Playlists', data: (playlists.data?.items ?? []).map((item) => ({ kind: 'playlist', item })) },
  ];

  const sectionEmpty = (key: 'events' | 'playlists') => {
    const query = key === 'events' ? events : playlists;
    if (query.isLoading) return <SkeletonRows count={2} height={88} />;
    if (query.error)
      return <EmptyState icon="alert-circle-outline" text={eventErrorText(query.error)} action={{ label: 'Retry', onPress: () => void query.refetch() }} />;
    if (q) return <Text style={styles.none}>{`No public ${key} match "${q}".`}</Text>;
    return key === 'events' ? (
      <EmptyState
        icon="compass-outline"
        text="No public events right now. Create one."
        action={{ label: 'Create event', onPress: () => router.push('/events/new') }}
      />
    ) : (
      <Text style={styles.none}>No public playlists yet.</Text>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search events and playlists"
          value={text}
          onChangeText={setText}
          loading={(events.isFetching || playlists.isFetching) && !refreshing && !!q}
          style={styles.search}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(row) => `${row.kind}:${row.item.id}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
        renderSectionHeader={({ section }) => (
          <Text variant="titleLarge" style={styles.section}>
            {section.title}
          </Text>
        )}
        renderSectionFooter={({ section }) => (section.data.length === 0 ? sectionEmpty(section.key) : null)}
        renderItem={({ item: row }) =>
          row.kind === 'event' ? (
            <EventCard event={row.item} onPress={() => router.push(`/events/${row.item.id}`)} />
          ) : (
            <PlaylistCard playlist={row.item} onPress={() => router.push(`/playlists/${row.item.id}`)} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  header: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[2] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  list: { padding: tokens.spacing.margin, paddingTop: 0, flexGrow: 1 },
  section: { marginTop: tokens.spacing[4], marginBottom: tokens.spacing[2] },
  separator: { height: tokens.spacing[2] },
  none: { color: tokens.colors.inkSecondary, paddingVertical: tokens.spacing[3] },
});
