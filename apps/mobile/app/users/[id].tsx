import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Menu, Text } from 'react-native-paper';
import { ApiError, errorMessage } from '@/api/errors';
import { useFriendActions, useProfile } from '@/api/queries';
import type { Profile } from '@/api/users';
import { Chip, EmptyState, SkeletonRows } from '@/events/components';
import { SectionCard, sectionRows } from '@/profile/components';
import { tokens } from '@/theme';
import { PrimaryButton, SecondaryButton } from '@/ui/components';
import { initial } from '@/ui/InviteSheet';
import { useSnackbar } from '@/ui/Snackbar';

/**
 * Another user's profile (FR-7): only what their privacy levels let me see — the server leaves the
 * other sections out (AD-7). Friendship actions live here too. Pull to refresh.
 */
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useProfile(id);
  const [refreshing, setRefreshing] = useState(false);
  const profile = query.data;

  const refresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: profile?.displayName ?? '', headerRight: () => (profile ? <FriendMenu profile={profile} /> : null) }} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        {!profile ? (
          query.error ? (
            <EmptyState
              icon={query.error instanceof ApiError && query.error.status === 404 ? 'account-question-outline' : 'alert-circle-outline'}
              text={query.error instanceof ApiError && query.error.status === 404 ? "This person doesn't exist." : errorMessage(query.error)}
              action={{ label: 'Retry', onPress: () => void query.refetch() }}
            />
          ) : (
            <SkeletonRows count={4} height={96} />
          )
        ) : (
          <>
            <View style={styles.header}>
              <Avatar.Text size={72} label={initial(profile.displayName)} style={styles.avatar} color={tokens.colors.inkPrimary} />
              <Text variant="titleLarge">{profile.displayName}</Text>
              {profile.friendship === 'friends' && <Chip icon="account-check-outline" label="Friends" />}
              <FriendAction profile={profile} />
            </View>
            <SectionCard section="public" rows={sectionRows(profile, 'public')} />
            <SectionCard section="music" rows={sectionRows(profile, 'music')} />
            {profile.friends ? (
              <SectionCard section="friends" rows={sectionRows(profile, 'friends')} />
            ) : (
              <Text variant="bodySmall" style={styles.meta}>
                Only {profile.displayName}&apos;s friends see their friends-only info.
              </Text>
            )}
            {profile.private && <SectionCard section="private" rows={sectionRows(profile, 'private')} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function useRun() {
  const { show } = useSnackbar();
  return async <T,>(action: () => Promise<T>, done: string | ((result: T) => string)) => {
    try {
      const result = await action();
      show(typeof done === 'string' ? done : done(result));
    } catch (error) {
      show(errorMessage(error));
    }
  };
}

/** The main friendship button under the name: Add / Cancel request / Accept + Decline / Edit (self). */
function FriendAction({ profile }: { profile: Profile }) {
  const actions = useFriendActions();
  const run = useRun();
  const busy = Object.values(actions).some((m) => m.isPending);
  const name = profile.displayName;
  // If they had already asked me, the server makes us friends right away.
  const add = () =>
    run(
      () => actions.request.mutateAsync(profile.id),
      (next) => (next.friendship === 'friends' ? `You and ${name} are now friends.` : `Friend request sent to ${name}.`),
    );

  switch (profile.friendship) {
    case 'self':
      return (
        <SecondaryButton icon="pencil-outline" onPress={() => router.navigate('/profile')}>
          Edit your profile
        </SecondaryButton>
      );
    case 'none':
      return (
        <PrimaryButton
          icon="account-plus-outline"
          loading={actions.request.isPending}
          disabled={busy}
          onPress={() => void add()}
        >
          Add friend
        </PrimaryButton>
      );
    case 'outgoing':
      return (
        <SecondaryButton
          icon="account-clock-outline"
          disabled={busy || !profile.requestId}
          onPress={() => void run(() => actions.cancel.mutateAsync(profile.requestId!), 'Request cancelled.')}
        >
          Cancel request
        </SecondaryButton>
      );
    case 'incoming':
      return (
        <View style={styles.row}>
          <SecondaryButton
            disabled={busy || !profile.requestId}
            onPress={() => void run(() => actions.decline.mutateAsync(profile.requestId!), 'Request declined.')}
          >
            Decline
          </SecondaryButton>
          <PrimaryButton
            disabled={busy || !profile.requestId}
            loading={actions.accept.isPending}
            onPress={() => void run(() => actions.accept.mutateAsync(profile.requestId!), `You and ${name} are now friends.`)}
          >
            Accept
          </PrimaryButton>
        </View>
      );
    case 'friends':
      return null;
  }
}

/** Header overflow for a friend: Remove friend, after a confirmation. */
function FriendMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const actions = useFriendActions();
  const run = useRun();
  if (profile.friendship !== 'friends') return null;
  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={<Appbar.Action icon="dots-vertical" accessibilityLabel="More options" onPress={() => setOpen(true)} />}
    >
      <Menu.Item
        leadingIcon="account-remove-outline"
        title="Remove friend"
        disabled={actions.remove.isPending}
        onPress={() => {
          setOpen(false);
          Alert.alert(`Remove ${profile.displayName} from your friends?`, undefined, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () =>
                void run(() => actions.remove.mutateAsync(profile.id), `${profile.displayName} removed from your friends.`),
            },
          ]);
        }}
      />
    </Menu>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  content: { padding: tokens.spacing.margin, gap: tokens.spacing[3], paddingBottom: tokens.spacing[6] },
  header: { alignItems: 'center', gap: tokens.spacing[2], paddingBottom: tokens.spacing[3] },
  avatar: { backgroundColor: tokens.colors.surfaceOverlay },
  meta: { color: tokens.colors.inkSecondary, paddingHorizontal: tokens.spacing[1] },
  row: { flexDirection: 'row', gap: tokens.spacing[2] },
});
