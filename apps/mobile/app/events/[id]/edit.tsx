import { router, useLocalSearchParams } from 'expo-router';
import { eventsApi } from '@/api/events';
import { useEventDetail, useStoreEvent } from '@/api/queries';
import { EmptyState, SkeletonRows } from '@/events/components';
import { eventErrorText } from '@/events/copy';
import { EventForm } from '@/events/EventForm';
import { Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Edit event (host only; the server answers 403 NOT_HOST to anyone else). */
export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error } = useEventDetail(id, null);
  const store = useStoreEvent();
  const { show } = useSnackbar();

  if (!data) {
    return <Screen>{error ? <EmptyState icon="alert-circle-outline" text={eventErrorText(error)} /> : <SkeletonRows count={4} />}</Screen>;
  }

  return (
    <Screen>
      <EventForm
        initial={data.event}
        submitLabel="Save"
        onSubmit={async (input) => {
          store(await eventsApi.update(id, input));
          show('Event updated.');
          router.back();
        }}
      />
    </Screen>
  );
}
