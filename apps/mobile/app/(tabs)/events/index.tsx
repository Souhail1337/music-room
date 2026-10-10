import { Screen } from '@/ui/components';
import { Placeholder } from '@/ui/Placeholder';

export default function Events() {
  return (
    <Screen scroll={false}>
      <Placeholder icon="party-popper" title="Events" body="Events you host, are invited to or joined will show up here." />
    </Screen>
  );
}
