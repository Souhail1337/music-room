import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { authApi } from '@/api/auth';
import { conflictOf, usePlaylistDetail, usePlaylistEditPending, usePlaylistEdits } from '@/api/queries';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import { conflictText, playlistErrorText } from '@/playlists/copy';
import { useSnackbar } from '@/ui/Snackbar';
import { TrackSearchSheet } from '@/ui/TrackSearchSheet';

/** Track search sheet for a playlist: tap a result to append it (with the version we hold, AD-3). */
export default function AddTrack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });
  const { data: detail } = usePlaylistDetail(id);
  const { add } = usePlaylistEdits(id);
  const editPending = usePlaylistEditPending(id);
  const inList = new Set((detail?.tracks ?? []).map((e) => e.track.id));

  return (
    <TrackSearchSheet
      hint="Search the catalog to add a track."
      verb="Add"
      isAdded={(trackId) => inList.has(trackId)}
      isDisabled={(trackId) => inList.has(trackId)}
      pending={editPending}
      onPick={(track) => {
        // Sent with the version of the list shown here (the one "Already added" was computed from).
        const before = detail;
        add.mutate({ trackId: track.id, baseVersion: detail?.version ?? 0 }, {
          onSuccess: () => {
            show(`Added ${track.title}.`);
            router.back();
          },
          // On a conflict the list is refreshed underneath; the user can tap again.
          onError: (error) => {
            const conflict = conflictOf(error);
            show(conflict ? conflictText(conflict, before, null, me?.id) : playlistErrorText(error));
          },
        });
      }}
    />
  );
}
