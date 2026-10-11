import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { ActivityIndicator, IconButton, Searchbar } from 'react-native-paper';
import { ApiError, errorMessage } from '@/api/errors';
import { useTrackSearch } from '@/api/queries';
import { EmptyState, SkeletonRows, TrackRow } from '@/events/components';
import { usePlayer, usePlayerStatus } from '@/player/PlayerProvider';
import { tokens } from '@/theme';
import { useDebounced } from '@/ui/useDebounced';

function searchErrorText(error: unknown): string {
  if (error instanceof ApiError && error.code === 'MUSIC_UNAVAILABLE') return 'Music search is unavailable right now.';
  return errorMessage(error);
}

/**
 * Search & play: debounced catalog search (300ms); tapping a result plays its 30-second preview in
 * the app-wide player. Nothing is added to events or playlists from here.
 */
export default function Search() {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useTrackSearch(q);
  const player = usePlayer();
  const { playing } = usePlayerStatus();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Search songs or artists"
          value={text}
          onChangeText={setText}
          loading={search.isFetching}
          style={styles.search}
          inputStyle={styles.searchInput}
          iconColor={tokens.colors.inkSecondary}
          placeholderTextColor={tokens.colors.inkSecondary}
        />
      </View>
      {!q ? (
        <EmptyState icon="music-circle-outline" text="Search any song and listen to a 30-second preview." />
      ) : search.isLoading ? (
        <View style={styles.pad}>
          <SkeletonRows count={6} />
        </View>
      ) : search.error ? (
        <EmptyState
          icon="cloud-off-outline"
          text={searchErrorText(search.error)}
          action={{ label: 'Retry', onPress: () => void search.refetch() }}
        />
      ) : (
        <FlatList
          data={search.data?.items ?? []}
          keyExtractor={(t) => t.id}
          extraData={`${player.track?.id}:${player.loading}:${playing}`}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.pad}
          ListEmptyComponent={<EmptyState icon="music-off" text={`No tracks for "${q}".`} />}
          renderItem={({ item }) => {
            const current = player.track?.id === item.id;
            const isPlaying = current && playing;
            const onPress = () => (current ? player.toggle() : player.play(item));
            return (
              <TrackRow
                track={item}
                onPress={onPress}
                accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${item.title} by ${item.artist}`}
                highlighted={current}
                trailing={
                  current && player.loading ? (
                    <View style={styles.spinner}>
                      <ActivityIndicator size={20} color={tokens.colors.accent} />
                    </View>
                  ) : (
                    <IconButton
                      icon={isPlaying ? 'pause-circle' : 'play-circle'}
                      iconColor={current ? tokens.colors.accent : tokens.colors.inkPrimary}
                      size={32}
                      onPress={onPress}
                      accessibilityLabel={`${isPlaying ? 'Pause' : 'Play'} ${item.title}`}
                    />
                  )
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  header: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[2] },
  search: { backgroundColor: tokens.colors.surfaceOverlay, borderRadius: tokens.rounded.full },
  searchInput: { minHeight: 48 },
  pad: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[6], flexGrow: 1 },
  spinner: { width: 48, height: 48, margin: 6, alignItems: 'center', justifyContent: 'center' },
});
