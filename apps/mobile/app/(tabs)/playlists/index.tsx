import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FAB, SegmentedButtons } from 'react-native-paper';
import type { PlaylistScope } from '@/api/playlists';
import { usePlaylistList } from '@/api/queries';
import { EmptyState, SkeletonRows } from '@/events/components';
import { PlaylistCard } from '@/playlists/components';
import { playlistErrorText } from '@/playlists/copy';
import { tokens } from '@/theme';

type Tab = Exclude<PlaylistScope, 'discover'>;

const EMPTY: Record<Tab, string> = {
  mine: "You don't have any playlists yet. Create one.",
  shared: 'Playlists people share with you show up here.',
};

/** Playlists: mine and shared with me. FAB to create (FR-17). */
export default function Playlists() {
  const [tab, setTab] = useState<Tab>('mine');
  const list = usePlaylistList(tab, '');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SegmentedButtons
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          buttons={[
            { value: 'mine', label: 'My playlists' },
            { value: 'shared', label: 'Shared with me' },
          ]}
        />
      </View>
      {list.isLoading ? (
        <View style={styles.list}>
          <SkeletonRows count={4} height={88} />
        </View>
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          renderItem={({ item }) => <PlaylistCard playlist={item} onPress={() => router.push(`/playlists/${item.id}`)} />}
          ListEmptyComponent={
            list.error ? (
              <EmptyState icon="alert-circle-outline" text={playlistErrorText(list.error)} action={{ label: 'Retry', onPress: () => void list.refetch() }} />
            ) : (
              <EmptyState icon="playlist-music" text={EMPTY[tab]} />
            )
          }
        />
      )}
      <FAB
        icon="plus"
        label="Create"
        style={styles.fab}
        color={tokens.colors.onAccent}
        onPress={() => router.push('/playlists/new')}
        accessibilityLabel="Create playlist"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  header: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[2] },
  list: { padding: tokens.spacing.margin, paddingTop: tokens.spacing[2], paddingBottom: 96, flexGrow: 1 },
  separator: { height: tokens.spacing[2] },
  fab: {
    position: 'absolute',
    right: tokens.spacing.margin,
    bottom: tokens.spacing.margin,
    backgroundColor: tokens.colors.accent,
    borderRadius: tokens.rounded.full,
  },
});
