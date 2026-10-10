import { Screen } from '@/ui/components';
import { Placeholder } from '@/ui/Placeholder';

export default function Discover() {
  return (
    <Screen scroll={false}>
      <Placeholder icon="compass-outline" title="No public events right now" body="Live events and public playlists will show up here." />
    </Screen>
  );
}
