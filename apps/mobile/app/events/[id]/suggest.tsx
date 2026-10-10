import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import type { EventDetail } from '@/api/events';
import { queryKeys, useEventDetail, useSuggest } from '@/api/queries';
import { eventErrorText } from '@/events/copy';
import { useLocation } from '@/location';
import { useSnackbar } from '@/ui/Snackbar';
import { TrackSearchSheet } from '@/ui/TrackSearchSheet';

/** Track search sheet: debounced search; tap a result to suggest it and close the sheet. */
export default function SuggestTrack() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const queryClient = useQueryClient();
  // The event screen below already holds the event: it decides whether we need a position.
  const opened = queryClient.getQueryData<EventDetail>(queryKeys.event(id));
  const location = useLocation(opened?.event.license === 'on_site' && opened.isHost === false);
  const { data: detail } = useEventDetail(id, location.coords);
  const suggest = useSuggest(id, location.coords);

  const queued = new Map((detail?.queue ?? []).map((s) => [s.track.id, s.id]));
  const myVotes = new Set(detail?.myVotes ?? []);

  return (
    <TrackSearchSheet
      hint="Search the catalog to suggest a track."
      verb="Suggest"
      isAdded={(trackId) => queued.has(trackId)}
      // A queued track I already voted for can't be suggested again.
      isDisabled={(trackId) => {
        const sid = queued.get(trackId);
        return sid !== undefined && myVotes.has(sid);
      }}
      pending={suggest.isPending}
      onPick={(track) => {
        const already = queued.has(track.id);
        suggest.mutate(track.id, {
          onSuccess: () => {
            show(already ? 'Voted.' : 'Suggested.');
            router.back();
          },
          onError: (error) => show(eventErrorText(error, detail?.event)),
        });
      }}
    />
  );
}
