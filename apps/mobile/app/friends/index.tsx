import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { Button, Searchbar, Text } from 'react-native-paper';
import { errorMessage } from '@/api/errors';
import { useFriendActions, useFriendRequests, useFriends, useUserSearch } from '@/api/queries';
import type { UserRef } from '@/api/users';
import { EmptyState, SkeletonRows } from '@/events/components';
import { PersonRow } from '@/profile/components';
import { tokens } from '@/theme';
import { useDebounced } from '@/ui/useDebounced';
import { useSnackbar } from '@/ui/Snackbar';

type Row =
  | { kind: 'incoming'; requestId: string; user: UserRef }
  | { kind: 'outgoing'; requestId: string; user: UserRef }
  | { kind: 'friend'; user: UserRef }
  | { kind: 'result'; user: UserRef; isFriend: boolean };

const openProfile = (user: UserRef) => router.push(`/users/${user.id}`);

/** Friends (FR-8): requests to answer, requests sent, my friends, and search to add someone. Pull to refresh. */
export default function Friends() {
  const { show } = useSnackbar();
  const friends = useFriends();
  const requests = useFriendRequests();
  const actions = useFriendActions();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useUserSearch(q);
  const searching = q.length >= 2;
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([friends.refetch(), requests.refetch(), searching ? search.refetch() : null]);
    setRefreshing(false);
  };

  const incoming = requests.data?.incoming ?? [];
  const outgoing = requests.data?.outgoing ?? [];
  const pendingTo = new Map(outgoing.map((r) => [r.user.id, r.id]));
  const pendingFrom = new Map(incoming.map((r) => [r.user.id, r.id]));
  const busy = Object.values(actions).some((m) => m.isPending);

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      show(done);
    } catch (error) {
      show(errorMessage(error));
    }
  };

  const sections: { title: string; data: Row[] }[] = searching
    ? [
        {
          title: 'People',
          data: (search.data?.items ?? []).map((u) => ({ kind: 'result', user: u, isFriend: u.isFriend })),
        },
      ]
    : [
        { title: 'Requests', data: incoming.map((r) => ({ kind: 'incoming', requestId: r.id, user: r.user })) },
        { title: 'Sent', data: outgoing.map((r) => ({ kind: 'outgoing', requestId: r.id, user: r.user })) },
        { title: 'Friends', data: (friends.data?.items ?? []).map((f) => ({ kind: 'friend', user: f })) },
      ];
  const visible = sections.filter((s) => s.data.length > 0 || (!searching && s.title === 'Friends'));
  const loading = searching ? search.isLoading : friends.isLoading || requests.isLoading;
  const error = searching ? search.error : (friends.error ?? requests.error);

  const accept = (requestId: string, user: UserRef) =>
    void run(() => actions.accept.mutateAsync(requestId), `You and ${user.displayName} are now friends.`);
  const addFriend = (user: UserRef) =>
    void (async () => {
      try {
        const profile = await actions.request.mutateAsync(user.id);
        // If they had already asked me, the server makes us friends right away.
        show(
          profile.friendship === 'friends'
            ? `You and ${user.displayName} are now friends.`
            : `Friend request sent to ${user.displayName}.`,
        );
      } catch (e) {
        show(errorMessage(e));
      }
    })();

  const trailing = (row: Row) => {
    switch (row.kind) {
      case 'incoming':
        return (
          <View style={styles.actions}>
            <Button compact disabled={busy} onPress={() => void run(() => actions.decline.mutateAsync(row.requestId), 'Request declined.')}>
              Decline
            </Button>
            <Button mode="contained" compact disabled={busy} onPress={() => accept(row.requestId, row.user)}>
              Accept
            </Button>
          </View>
        );
      case 'outgoing':
        return (
          <Button compact disabled={busy} onPress={() => void run(() => actions.cancel.mutateAsync(row.requestId), 'Request cancelled.')}>
            Cancel
          </Button>
        );
      case 'friend':
        return null;
      case 'result': {
        if (row.isFriend) return <Text style={styles.meta}>Friends</Text>;
        const sent = pendingTo.get(row.user.id);
        if (sent) return <Text style={styles.meta}>Requested</Text>;
        const theirs = pendingFrom.get(row.user.id);
        if (theirs)
          return (
            <Button mode="contained" compact disabled={busy} onPress={() => accept(theirs, row.user)}>
              Accept
            </Button>
          );
        return (
          <Button icon="account-plus-outline" compact disabled={busy} onPress={() => addFriend(row.user)}>
            Add
          </Button>
        );
      }
    }
  };


  const subtitle = (row: Row) =>
    row.kind === 'incoming' ? 'Wants to be friends' : row.kind === 'outgoing' ? 'Request sent' : undefined;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Add a friend: name or email"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          loading={search.isFetching}
          style={styles.search}
        />
        {text.trim().length === 1 && (
          <Text variant="bodySmall" style={[styles.meta, styles.hint]}>
            Type at least 2 characters.
          </Text>
        )}
      </View>
      {loading ? (
        <View style={styles.list}>
          <SkeletonRows count={5} height={56} />
        </View>
      ) : (
        <SectionList
          sections={visible}
          keyExtractor={(row) => `${row.kind}:${row.user.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          renderSectionHeader={({ section }) => (
            <Text variant="titleSmall" style={styles.caption}>
              {section.title}
            </Text>
          )}
          renderSectionFooter={({ section }) =>
            section.title === 'Friends' && section.data.length === 0 ? (
              <EmptyState icon="account-multiple-outline" text="No friends yet. Search by name or email to add one." />
            ) : null
          }
          renderItem={({ item }) => (
            <PersonRow name={item.user.displayName} subtitle={subtitle(item)} onPress={() => openProfile(item.user)} right={trailing(item)} />
          )}
          ListEmptyComponent={
            error ? (
              <EmptyState icon="alert-circle-outline" text={errorMessage(error)} action={{ label: 'Retry', onPress: () => void refresh() }} />
            ) : (
              <EmptyState icon="account-search-outline" text={`Nobody found for "${q}".`} />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  header: { paddingHorizontal: tokens.spacing.margin, paddingVertical: tokens.spacing[2] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  list: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[6], flexGrow: 1 },
  caption: { color: tokens.colors.inkSecondary, marginTop: tokens.spacing[4], marginBottom: tokens.spacing[1] },
  actions: { flexDirection: 'row', gap: tokens.spacing[1] },
  meta: { color: tokens.colors.inkSecondary },
  hint: { marginTop: tokens.spacing[1] },
});
