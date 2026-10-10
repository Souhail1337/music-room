import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Menu, Text } from 'react-native-paper';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/errors';
import type { EventDetail } from '@/api/events';
import {
  useAnnounceMyTracks,
  useEventDetail,
  useEventRoom,
  useRealtimeStatus,
  useVote,
} from '@/api/queries';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import {
  Chip,
  EmptyState,
  NowPlayingCard,
  Notice,
  ReconnectingBar,
  SkeletonRows,
  TrackRow,
  VoteButton,
} from '@/events/components';
import { eventErrorText, licenseLabel, reasonText } from '@/events/copy';
import { useElapsedProgress, useHostPlayer } from '@/events/useHostPlayer';
import { locationStore, useLocation } from '@/location';
import { tokens } from '@/theme';
import { PrimaryButton } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Event (Track Vote): Now Playing, the ranked queue, and "Suggest a track" (FR-12..FR-16). */
export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });

  // On-site events (non-hosts) watch the position; the server decides who is at the venue (AD-5).
  const [onSite, setOnSite] = useState(false);
  const location = useLocation(onSite);
  const query = useEventDetail(id, location.coords);
  const detail = query.data;
  const needsLocation = detail?.event.license === 'on_site' && detail.isHost === false;
  // The position is needed to load the event, and the event says whether a position is needed.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOnSite(needsLocation), [needsLocation]);

  const socketStatus = useRealtimeStatus();
  const online = socketStatus === 'connected';
  useEventRoom(id, !!detail);
  useAnnounceMyTracks(detail, me?.id);

  const vote = useVote(id, location.coords);
  const onVote = (suggestionId: string, voted: boolean) => {
    vote.mutate(
      { suggestionId, vote: !voted },
      {
        onSuccess: () => show(voted ? 'Vote removed.' : 'Voted.'),
        onError: (error) => show(eventErrorText(error, detail?.event)),
      },
    );
  };

  const isHost = detail?.isHost === true;

  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { refetch } = query;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="lock-outline" text="This event is private." />
      </SafeAreaView>
    );
  }

  const canAct = detail?.canAct.allowed === true;
  const actionsEnabled = canAct && online;
  const notice = detail ? noticeFor(detail, location.status) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: detail?.event.name ?? '',
          headerRight: () =>
            isHost ? (
              <Menu
                visible={menu}
                onDismiss={() => setMenu(false)}
                anchor={<Appbar.Action icon="dots-vertical" accessibilityLabel="More options" onPress={() => setMenu(true)} />}
              >
                <Menu.Item
                  leadingIcon="pencil-outline"
                  title="Edit event"
                  onPress={() => {
                    setMenu(false);
                    router.push(`/events/${id}/edit`);
                  }}
                />
                <Menu.Item
                  leadingIcon="account-plus-outline"
                  title="Invite people"
                  onPress={() => {
                    setMenu(false);
                    router.push(`/events/${id}/invite`);
                  }}
                />
              </Menu>
            ) : null,
        }}
      />
      {detail && !online && <ReconnectingBar />}
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!detail ? (
          query.error ? (
            <EmptyState icon="alert-circle-outline" text={eventErrorText(query.error)} action={{ label: 'Retry', onPress: () => void refetch() }} />
          ) : (
            <SkeletonRows count={5} />
          )
        ) : (
          <>
            <View style={styles.chips}>
              <Chip label={detail.event.visibility === 'public' ? 'Public' : 'Private'} />
              <Chip label={licenseLabel(detail.event.license, detail.event.startsAt, detail.event.endsAt)} />
              <Chip icon="headphones" label={`${detail.listeners} listening`} />
            </View>
            {detail.event.description ? (
              <Text variant="bodyMedium" style={styles.description}>
                {detail.event.description}
              </Text>
            ) : null}

            {isHost ? (
              <HostNowPlaying eventId={id} detail={detail} online={online} onMessage={show} />
            ) : (
              <ListenerNowPlaying nowPlaying={detail.nowPlaying} />
            )}

            <Text variant="titleLarge" style={styles.section}>
              Up next
            </Text>
            {notice && <Notice text={notice.text} action={notice.action} />}

            {detail.queue.length === 0 ? (
              <EmptyState
                icon="playlist-music"
                text="No tracks yet. Suggest the first one."
                action={{ label: 'Suggest a track', onPress: () => router.push(`/events/${id}/suggest`), disabled: !actionsEnabled }}
              />
            ) : (
              detail.queue.map((s) => {
                const voted = detail.myVotes.includes(s.id);
                return (
                  <Animated.View key={s.id} layout={LinearTransition.duration(200)}>
                    <TrackRow
                      track={s.track}
                      trailing={
                        <VoteButton
                          count={s.voteCount}
                          voted={voted}
                          title={s.track.title}
                          disabled={!actionsEnabled || (vote.isPending && vote.variables?.suggestionId === s.id)}
                          onPress={() => onVote(s.id, voted)}
                        />
                      }
                    />
                  </Animated.View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
      {detail && detail.queue.length > 0 && (
        <View style={styles.footer}>
          <PrimaryButton icon="plus" onPress={() => router.push(`/events/${id}/suggest`)} disabled={!actionsEnabled}>
            Suggest a track
          </PrimaryButton>
        </View>
      )}
    </SafeAreaView>
  );
}

/** Only the host's phone ever creates an audio player (FR-16). */
function HostNowPlaying({
  eventId,
  detail,
  online,
  onMessage,
}: {
  eventId: string;
  detail: EventDetail;
  online: boolean;
  onMessage: (text: string) => void;
}) {
  const player = useHostPlayer(eventId, detail, onMessage);
  return (
    <NowPlayingCard
      nowPlaying={detail.nowPlaying}
      progress={player.progress}
      host={{
        playing: player.playing,
        busy: player.busy,
        canStart: detail.queue.length > 0,
        disabled: !online,
        onPlayPause: player.playPause,
        onSkip: player.skip,
      }}
    />
  );
}

function ListenerNowPlaying({ nowPlaying }: { nowPlaying: EventDetail['nowPlaying'] }) {
  const progress = useElapsedProgress(nowPlaying?.startedAt ?? null, true);
  return <NowPlayingCard nowPlaying={nowPlaying} progress={progress} />;
}

/** "Can view, can't vote": the banner above the queue gives the reason (EXPERIENCE.md states). */
function noticeFor(
  detail: EventDetail,
  locationStatus: string,
): { text: string; action?: { label: string; onPress: () => void } } | null {
  if (detail.canAct.allowed || !detail.canAct.reason) return null;
  if (detail.canAct.reason === 'LOCATION_REQUIRED') {
    if (locationStatus === 'denied')
      return { text: 'Allow location to vote at this event.', action: { label: 'Open settings', onPress: () => void Linking.openSettings() } };
    if (locationStatus === 'unavailable')
      return { text: 'Allow location to vote at this event.', action: { label: 'Try again', onPress: () => void locationStore.retry() } };
    return { text: 'Finding your location…' };
  }
  return { text: reasonText(detail.canAct.reason, detail.event) };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  content: { padding: tokens.spacing.margin, gap: tokens.spacing[2], paddingBottom: tokens.spacing[6] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[1] },
  description: { color: tokens.colors.inkSecondary },
  section: { marginTop: tokens.spacing[5] },
  footer: {
    padding: tokens.spacing.margin,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.borderHairline,
    backgroundColor: tokens.colors.surfaceBase,
  },
});
