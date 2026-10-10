import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { useEventList } from '@/api/queries';
import { EmptyState, EventCard, SkeletonRows } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { tokens } from '@/theme';
import { useDebounced } from '@/ui/useDebounced';

/** Discover: search, then public events, live first. Private events never show here. */
export default function Discover() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const list = useEventList('discover', q);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await list.refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search events"
          value={text}
          onChangeText={setText}
          loading={list.isFetching && !refreshing && !!q}
          style={styles.search}
        />
      </View>
      {list.isLoading ? (
        <View style={styles.list}>
          <SkeletonRows count={4} height={88} />
        </View>
      ) : (
        <FlatList
          data={list.data?.items ?? []}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          renderItem={({ item }) => <EventCard event={item} onPress={() => router.push(`/events/${item.id}`)} />}
          ListEmptyComponent={
            list.error ? (
              <EmptyState icon="alert-circle-outline" text={eventErrorText(list.error)} action={{ label: 'Retry', onPress: () => void list.refetch() }} />
            ) : q ? (
              <EmptyState icon="magnify" text={`No public events match "${q}".`} />
            ) : (
              <EmptyState
                icon="compass-outline"
                text="No public events right now. Create one."
                action={{ label: 'Create event', onPress: () => router.push('/events/new') }}
              />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  header: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[2] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  list: { padding: tokens.spacing.margin, paddingTop: tokens.spacing[2], flexGrow: 1 },
  separator: { height: tokens.spacing[2] },
});
