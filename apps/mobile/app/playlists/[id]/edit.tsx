import { router, useLocalSearchParams } from 'expo-router';
import { playlistsApi } from '@/api/playlists';
import { usePlaylistDetail, useStorePlaylist } from '@/api/queries';
import { EmptyState, SkeletonRows } from '@/events/components';
import { playlistErrorText } from '@/playlists/copy';
import { PlaylistForm } from '@/playlists/PlaylistForm';
import { Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Edit playlist (owner only; the server answers 403 NOT_OWNER to anyone else). */
export default function EditPlaylist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = usePlaylistDetail(id);
  const store = useStorePlaylist();
  const { show } = useSnackbar();

  if (!data) {
    return <Screen>{error ? <EmptyState icon="alert-circle-outline" text={playlistErrorText(error)} /> : <SkeletonRows count={4} />}</Screen>;
  }

  return (
    <Screen>
      <PlaylistForm
        initial={data.playlist}
        submitLabel="Save"
        onSubmit={async (input) => {
          store(await playlistsApi.update(id, input));
          show('Playlist updated.');
          router.back();
        }}
      />
    </Screen>
  );
}
