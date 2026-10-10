import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Searchbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '../api/errors';
import type { Track } from '../api/music';
import { useTrackSearch } from '../api/queries';
import { EmptyState, SkeletonRows, TrackRow } from '../events/components';
import { tokens } from '../theme';
import { useDebounced } from './useDebounced';

/**
 * Track search sheet shared by "Suggest a track" (event) and "Add track" (playlist): debounced
 * search (300ms); tapping a result picks it. A track already in the list shows "Already added".
 */
export function TrackSearchSheet({
  hint,
  verb,
  isAdded,
  isDisabled,
  pending,
  onPick,
}: {
  /** Shown before the user types. */
  hint: string;
  /** Screen-reader verb for a result, e.g. "Suggest" or "Add". */
  verb: string;
  isAdded: (trackId: string) => boolean;
  /** Extra per-row disabling (e.g. already voted). */
  isDisabled?: (trackId: string) => boolean;
  pending: boolean;
  onPick: (track: Track) => void;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useTrackSearch(q);

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
        <EmptyState icon="magnify" text={hint} />
      ) : search.isLoading ? (
        <View style={styles.pad}>
          <SkeletonRows count={5} />
        </View>
      ) : search.error ? (
        <EmptyState
          icon="cloud-off-outline"
          text={search.error instanceof ApiError ? search.error.message : errorMessage(search.error)}
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
            const added = isAdded(item.id);
            return (
              <TrackRow
                track={item}
                disabled={pending || (isDisabled?.(item.id) ?? false)}
                onPress={() => onPick(item)}
                accessibilityLabel={`${added ? 'Already added: ' : `${verb} `}${item.title} by ${item.artist}`}
                trailing={
                  added ? (
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
