import { router } from 'expo-router';
import { eventsApi } from '@/api/events';
import { useStoreEvent } from '@/api/queries';
import { EventForm } from '@/events/EventForm';
import { Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Create event (FR-9, FR-10). The creator becomes the host. */
export default function NewEvent() {
  const store = useStoreEvent();
  const { show } = useSnackbar();
  return (
    <Screen>
      <EventForm
        submitLabel="Create event"
        onSubmit={async (input) => {
          const created = await eventsApi.create(input);
          store(created);
          show('Event created.');
          router.replace(`/events/${created.event.id}`);
        }}
      />
    </Screen>
  );
}
