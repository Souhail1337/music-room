import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { FAB, SegmentedButtons } from 'react-native-paper';
import type { Scope } from '@/api/events';
import { useEventList } from '@/api/queries';
import { EmptyState, EventCard, SkeletonRows } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { tokens } from '@/theme';

type Tab = Exclude<Scope, 'discover'>;

const EMPTY: Record<Tab, string> = {
  hosting: "You aren't hosting any events. Create one.",
  invited: 'No invitations yet.',
  joined: "Events where you suggest or vote show up here.",
};

/** Events: the ones I host, I'm invited to, and I joined. FAB to create. */
export default function Events() {
  const [tab, setTab] = useState<Tab>('hosting');
  const list = useEventList(tab, '');
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
            { value: 'hosting', label: 'Hosting' },
            { value: 'invited', label: 'Invited' },
            { value: 'joined', label: 'Joined' },
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
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          renderItem={({ item }) => <EventCard event={item} onPress={() => router.push(`/events/${item.id}`)} />}
          ListEmptyComponent={
            list.error ? (
              <EmptyState icon="alert-circle-outline" text={eventErrorText(list.error)} action={{ label: 'Retry', onPress: () => void list.refetch() }} />
            ) : (
              <EmptyState icon="party-popper" text={EMPTY[tab]} />
            )
          }
        />
      )}
      <FAB
        icon="plus"
        label="Create"
        style={styles.fab}
        color={tokens.colors.onAccent}
        onPress={() => router.push('/events/new')}
        accessibilityLabel="Create event"
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
