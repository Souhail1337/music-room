import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Avatar, Searchbar, Switch, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { errorMessage } from '@/api/errors';
import { eventsApi } from '@/api/events';
import { queryKeys, useInvites, useUserSearch } from '@/api/queries';
import type { UserRef } from '@/api/users';
import { EmptyState, SkeletonRows } from '@/events/components';
import { tokens } from '@/theme';
import { useSnackbar } from '@/ui/Snackbar';
import { useDebounced } from '@/ui/useDebounced';

/** Invite people (FR-11): search users by name or exact email and toggle their invite. Host only. */
export default function InvitePeople() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { show } = useSnackbar();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const invites = useInvites(id, true);
  const search = useUserSearch(q);

  const toggle = useMutation({
    mutationFn: ({ user, invite }: { user: UserRef; invite: boolean }) =>
      invite ? eventsApi.invite(id, user.id) : eventsApi.uninvite(id, user.id),
    onSuccess: (data, { user, invite }) => {
      queryClient.setQueryData(queryKeys.invites(id), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.event(id) });
      show(invite ? `${user.displayName} invited.` : `${user.displayName} removed.`);
    },
    onError: (error) => show(errorMessage(error)),
  });

  const invitedIds = new Set((invites.data?.items ?? []).map((u) => u.id));
  const searching = q.length >= 2;
  const rows: UserRef[] = searching ? (search.data?.items ?? []) : (invites.data?.items ?? []);
  const loading = searching ? search.isLoading : invites.isLoading;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Name or email"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          loading={search.isFetching}
          style={styles.search}
        />
        <Text variant="titleSmall" style={styles.caption}>
          {searching ? 'People' : 'Invited'}
        </Text>
      </View>
      {loading ? (
        <View style={styles.pad}>
          <SkeletonRows count={4} height={56} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pad}
          ListEmptyComponent={
            <EmptyState
              icon="account-search-outline"
              text={
                searching
                  ? `Nobody found for "${q}".`
                  : text.trim().length === 1
                    ? 'Type at least 2 characters.'
                    : 'Nobody invited yet. Search by name or email.'
              }
            />
          }
          renderItem={({ item }) => {
            const invited = invitedIds.has(item.id);
            const pending = toggle.isPending && toggle.variables?.user.id === item.id;
            return (
              <View style={styles.row}>
                <Avatar.Text
                  size={40}
                  label={(Array.from(item.displayName)[0] ?? '?').toUpperCase()}
                  style={styles.avatar}
                  color={tokens.colors.inkPrimary}
                />
                <Text variant="bodyLarge" style={styles.name} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Switch
                  value={invited}
                  disabled={pending}
                  onValueChange={(invite) => toggle.mutate({ user: item, invite })}
                  accessibilityLabel={`Invite ${item.displayName}`}
                />
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceOverlay },
  header: { padding: tokens.spacing.margin, gap: tokens.spacing[3] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  caption: { color: tokens.colors.inkSecondary },
  pad: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[6] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], minHeight: 56 },
  avatar: { backgroundColor: tokens.colors.surfaceRaised },
  name: { flex: 1 },
});
