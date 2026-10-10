import { useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';
import { Avatar, Searchbar, Switch, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFriends, useUserSearch } from '../api/queries';
import type { UserRef } from '../api/users';
import { EmptyState, SkeletonRows } from '../events/components';
import { tokens } from '../theme';
import { useDebounced } from './useDebounced';

export function initial(name: string): string {
  return (Array.from(name)[0] ?? '?').toUpperCase();
}

/**
 * Invite people (events and playlists): search users by name or exact email (`GET /users/search`,
 * friends first) and toggle their invite. With an empty search it lists my friends first, then the
 * other people already invited.
 */
export function InviteSheet({
  invites,
  loading,
  pendingUserId,
  onToggle,
}: {
  invites: UserRef[] | undefined;
  loading: boolean;
  pendingUserId: string | null;
  onToggle: (user: UserRef, invite: boolean) => void;
}) {
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const search = useUserSearch(q);
  const friends = useFriends();

  const invitedIds = new Set((invites ?? []).map((u) => u.id));
  const searching = q.length >= 2;
  const friendIds = new Set((friends.data?.items ?? []).map((f) => f.id));
  // Empty sections are dropped so an empty result shows the list's empty state.
  const sections: { title: string; data: (UserRef & { isFriend?: boolean })[] }[] = (searching
    ? [{ title: 'People', data: search.data?.items ?? [] }]
    : [
        { title: 'Friends', data: (friends.data?.items ?? []).map((f) => ({ ...f, isFriend: true })) },
        { title: 'Invited', data: (invites ?? []).filter((u) => !friendIds.has(u.id)) },
      ]
  ).filter((section) => section.data.length > 0);
  const busy = searching ? search.isLoading : loading || friends.isLoading;

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
      </View>
      {busy ? (
        <View style={styles.pad}>
          <SkeletonRows count={4} height={56} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(u) => u.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pad}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text variant="titleSmall" style={styles.caption}>
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="account-search-outline"
              text={
                searching
                  ? `Nobody found for "${q}".`
                  : text.trim().length === 1
                    ? 'Type at least 2 characters.'
                    : 'No friends or invites yet. Search by name or email.'
              }
            />
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar.Text size={40} label={initial(item.displayName)} style={styles.avatar} color={tokens.colors.inkPrimary} />
              <View style={styles.name}>
                <Text variant="bodyLarge" numberOfLines={1}>
                  {item.displayName}
                </Text>
                {searching && item.isFriend ? (
                  <Text variant="bodySmall" style={styles.meta}>
                    Friend
                  </Text>
                ) : null}
              </View>
              <Switch
                value={invitedIds.has(item.id)}
                disabled={pendingUserId === item.id}
                onValueChange={(invite) => onToggle(item, invite)}
                accessibilityLabel={`Invite ${item.displayName}`}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceOverlay },
  header: { padding: tokens.spacing.margin, gap: tokens.spacing[3] },
  search: { backgroundColor: tokens.colors.surfaceRaised, borderRadius: tokens.rounded.full },
  caption: { color: tokens.colors.inkSecondary, marginTop: tokens.spacing[2], marginBottom: tokens.spacing[1] },
  meta: { color: tokens.colors.inkSecondary },
  pad: { paddingHorizontal: tokens.spacing.margin, paddingBottom: tokens.spacing[6] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], minHeight: 56 },
  avatar: { backgroundColor: tokens.colors.surfaceRaised },
  name: { flex: 1 },
});
