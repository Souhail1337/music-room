import { Screen } from '@/ui/components';
import { Placeholder } from '@/ui/Placeholder';

export default function Playlists() {
  return (
    <Screen scroll={false}>
      <Placeholder icon="playlist-music" title="Playlists" body="Your playlists and the ones shared with you will show up here." />
    </Screen>
  );
}
