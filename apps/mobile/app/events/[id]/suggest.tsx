import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/api/errors';
import type { EventDetail } from '@/api/events';
import { queryKeys, useEventDetail, useSuggest, useTrackSearch } from '@/api/queries';
import { EmptyState, SkeletonRows, TrackRow } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { useLocation } from '@/location';
import { tokens } from '@/theme';
import { useSnackbar } from '@/ui/Snackbar';
import { useDebounced } from '@/ui/useDebounced';

/** Track search sheet: debounced search; tap a result to suggest it and close the sheet. */
export default function SuggestTrack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const queryClient = useQueryClient();
  // The event screen below already holds the event: it decides whether we need a position.
  const opened = queryClient.getQueryData<EventDetail>(queryKeys.event(id));
  const location = useLocation(opened?.event.license === 'on_site' && opened.isHost === false);
  const { data: detail } = useEventDetail(id, location.coords);
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useTrackSearch(q);
  const suggest = useSuggest(id, location.coords);

  const queued = new Map((detail?.queue ?? []).map((s) => [s.track.id, s.id]));
  const myVotes = new Set(detail?.myVotes ?? []);

  const pick = (trackId: string) => {
    const already = queued.has(trackId);
    suggest.mutate(trackId, {
      onSuccess: () => {
        show(already ? 'Voted.' : 'Suggested.');
        router.back();
      },
      onError: (error) => show(eventErrorText(error, detail?.event)),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search tracks or artists"
          value={text}
          onChangeText={setText}
          autoFocus
          loading={search.isFetching}
          style={styles.search}
          inputStyle={styles.searchInput}
        />
      </View>
      {!q ? (
        <EmptyState icon="magnify" text="Search the catalog to suggest a track." />
      ) : search.isLoading ? (
        <View style={styles.pad}>
          <SkeletonRows count={5} />
        </View>
      ) : search.error ? (
        <EmptyState
          icon="cloud-off-outline"
          text={search.error instanceof ApiError ? search.error.message : eventErrorText(search.error)}
          action={{ label: 'Retry', onPress: () => void search.refetch() }}
        />
      ) : (
        <FlatList
          data={search.data?.items ?? []}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pad}
          ListEmptyComponent={<EmptyState icon="music-off" text={`No tracks for "${q}".`} />}
          renderItem={({ item }) => {
            const sid = queued.get(item.id);
            const done = sid !== undefined && myVotes.has(sid);
            return (
              <TrackRow
                track={item}
                disabled={suggest.isPending || done}
                onPress={() => pick(item.id)}
                accessibilityLabel={`${sid ? 'Already added: ' : 'Suggest '}${item.title} by ${item.artist}`}
                trailing={
                  sid !== undefined ? (
                    <Text variant="labelMedium" style={styles.added}>
                      Already added
                    </Text>
                  ) : null
                }
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceOverlay },
  header: { padding: tokens.spacing.margin, paddingBottom: tokens.spacing[2] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  searchInput: { minHeight: 48 },
  pad: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[6] },
  added: { color: tokens.colors.inkSecondary },
});
