import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Appbar, Menu, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import type { PlaylistEntry } from '@/api/playlists';
import {
  conflictOf,
  usePlaylistDetail,
  usePlaylistEditPending,
  usePlaylistEdits,
  usePlaylistRoom,
  useRealtimeStatus,
} from '@/api/queries';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import { Chip, EmptyState, ReconnectingBar, SkeletonRows } from '@/events/components';
import { EditableTrackList, PresenceAvatars } from '@/playlists/components';
import { conflictText, playlistErrorText, playlistLicenseLabel } from '@/playlists/copy';
import { tokens } from '@/theme';
import { PrimaryButton } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Playlist (Editor): a live, collaboratively edited track list with presence (FR-19..FR-21). */
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });
  const query = usePlaylistDetail(id);
  const detail = query.data;

  const socketStatus = useRealtimeStatus();
  const online = socketStatus === 'connected';
  usePlaylistRoom(id, !!detail);
  const { add, move, remove, current } = usePlaylistEdits(id);
  // One edit at a time: the next one needs the version the previous one produced (AD-3).
  const editPending = usePlaylistEditPending(id);

  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { refetch } = query;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  /** Server state wins on a conflict (already in the cache): say who changed it, never re-apply. */
  const onEditError = (error: unknown, before: ReturnType<typeof current>, entryId: string | null) => {
    const conflict = conflictOf(error);
    show(conflict ? conflictText(conflict, before, entryId, me?.id) : playlistErrorText(error));
  };

  const onMove = (entry: PlaylistEntry, toIndex: number, baseVersion: number) => {
    const before = current();
    move.mutate({ entryId: entry.id, toIndex, baseVersion }, { onError: (error) => onEditError(error, before, entry.id) });
  };

  const onRemove = (entry: PlaylistEntry, baseVersion: number) => {
    const before = current();
    const from = before?.tracks.findIndex((e) => e.id === entry.id) ?? -1;
    remove.mutate({ entryId: entry.id, baseVersion }, {
      onSuccess: () =>
        show(`Removed ${entry.track.title}.`, {
          label: 'Undo',
          // Undo = add it back, then move it to where it was (two ordinary versioned edits).
          onPress: () => {
            const undoFrom = current();
            add.mutate(
              { trackId: entry.track.id, baseVersion: undoFrom?.version ?? 0 },
              {
                onSuccess: (data) => {
                  const added = data.tracks.find((e) => e.track.id === entry.track.id);
                  if (added && from >= 0 && from < data.tracks.length - 1)
                    move.mutate(
                      { entryId: added.id, toIndex: from, baseVersion: data.version },
                      { onError: (error) => onEditError(error, data, added.id) },
                    );
                },
                onError: (error) => onEditError(error, undoFrom, null),
              },
            );
          },
        }),
      onError: (error) => onEditError(error, before, entry.id),
    });
  };

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="lock-outline" text="This playlist is private." />
      </SafeAreaView>
    );
  }

  const canEdit = detail?.canEdit.allowed === true;
  const editsEnabled = canEdit && online && !editPending;
  const isOwner = detail?.isOwner === true;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: detail?.playlist.name ?? '',
          headerRight: () => (
            <View style={styles.headerRight}>
              {detail && <PresenceAvatars viewers={detail.viewers} />}
              {isOwner && (
                <Menu
                  visible={menu}
                  onDismiss={() => setMenu(false)}
                  anchor={<Appbar.Action icon="dots-vertical" accessibilityLabel="More options" onPress={() => setMenu(true)} />}
                >
                  <Menu.Item
                    leadingIcon="pencil-outline"
                    title="Edit playlist"
                    onPress={() => {
                      setMenu(false);
                      router.push(`/playlists/${id}/edit`);
                    }}
                  />
                  <Menu.Item
                    leadingIcon="account-plus-outline"
                    title="Invite people"
                    onPress={() => {
                      setMenu(false);
                      router.push(`/playlists/${id}/invite`);
                    }}
                  />
                </Menu>
              )}
            </View>
          ),
        }}
      />
      {detail && !online && <ReconnectingBar />}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {!detail ? (
          query.error ? (
            <EmptyState icon="alert-circle-outline" text={playlistErrorText(query.error)} action={{ label: 'Retry', onPress: () => void refetch() }} />
          ) : (
            <SkeletonRows count={5} />
          )
        ) : (
          <>
            <View style={styles.chips}>
              <Chip label={detail.playlist.visibility === 'public' ? 'Public' : 'Private'} />
              <Chip label={playlistLicenseLabel(detail.playlist.license)} />
              {!canEdit && <Chip icon="eye-outline" label="View only" />}
            </View>
            <Text variant="bodySmall" style={styles.meta}>
              By {detail.playlist.owner.displayName} · {detail.tracks.length} {detail.tracks.length === 1 ? 'track' : 'tracks'}
              {detail.lastEditor ? ` · Last edited by ${detail.lastEditor.displayName}` : ''}
            </Text>
            {detail.playlist.description ? (
              <Text variant="bodyMedium" style={styles.meta}>
                {detail.playlist.description}
              </Text>
            ) : null}

            {detail.tracks.length === 0 ? (
              <EmptyState
                icon="playlist-music"
                text="Empty playlist. Add a track to get started."
                action={canEdit ? { label: 'Add track', onPress: () => router.push(`/playlists/${id}/add`), disabled: !editsEnabled } : undefined}
              />
            ) : (
              <EditableTrackList
                entries={detail.tracks}
                version={detail.version}
                editable={editsEnabled}
                onMove={onMove}
                onRemove={onRemove}
              />
            )}
          </>
        )}
      </ScrollView>
      {detail && canEdit && detail.tracks.length > 0 && (
        <View style={styles.footer}>
          <PrimaryButton icon="plus" onPress={() => router.push(`/playlists/${id}/add`)} disabled={!editsEnabled}>
            Add track
          </PrimaryButton>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  content: { padding: tokens.spacing.margin, gap: tokens.spacing[2], paddingBottom: tokens.spacing[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] },
  meta: { color: tokens.colors.inkSecondary },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  footer: {
    padding: tokens.spacing.margin,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.borderHairline,
    backgroundColor: tokens.colors.surfaceBase,
  },
});
