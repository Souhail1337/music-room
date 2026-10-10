import { router } from 'expo-router';
import { playlistsApi } from '@/api/playlists';
import { useStorePlaylist } from '@/api/queries';
import { PlaylistForm } from '@/playlists/PlaylistForm';
import { Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Create playlist (FR-17, FR-18). The creator becomes the owner. */
export default function NewPlaylist() {
  const store = useStorePlaylist();
  const { show } = useSnackbar();
  return (
    <Screen>
      <PlaylistForm
        submitLabel="Create playlist"
        onSubmit={async (input) => {
          const created = await playlistsApi.create(input);
          store(created);
          show('Playlist created.');
          router.replace(`/playlists/${created.playlist.id}`);
        }}
      />
    </Screen>
  );
}
