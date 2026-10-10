import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Badge, Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { useFriendRequests, useMyProfile } from '@/api/queries';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import { EmptyState, SkeletonRows } from '@/events/components';
import { SECTION_KEYS, SectionCard, sectionRows } from '@/profile/components';
import { tokens } from '@/theme';
import { SecondaryButton } from '@/ui/components';
import { initial } from '@/ui/InviteSheet';
import { errorMessage } from '@/api/errors';

/** My profile: four privacy-labelled section cards (tap to edit), Friends, and Settings in the header. */
export default function Profile() {
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });
  const profile = useMyProfile();
  const requests = useFriendRequests();
  const [refreshing, setRefreshing] = useState(false);
  const incoming = requests.data?.incoming.length ?? 0;
  const name = profile.data?.displayName ?? me?.displayName ?? '';

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([profile.refetch(), requests.refetch()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Appbar.Action icon="cog-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.header}>
          <Avatar.Text
            size={72}
            label={initial(name || '?')}
            style={{ backgroundColor: tokens.colors.surfaceOverlay }}
            color={tokens.colors.inkPrimary}
          />
          <Text variant="titleLarge">{name}</Text>
          <Text variant="bodySmall" style={styles.meta}>
            {me?.email ?? ''}
          </Text>
          <View>
            <SecondaryButton
              icon="account-multiple-outline"
              onPress={() => router.push('/friends')}
              accessibilityLabel={incoming > 0 ? `Friends, ${incoming} new ${incoming === 1 ? 'request' : 'requests'}` : 'Friends'}
            >
              Friends
            </SecondaryButton>
            {incoming > 0 && <Badge style={styles.badge}>{incoming}</Badge>}
          </View>
        </View>

        {profile.data ? (
          SECTION_KEYS.map((key) => (
            <SectionCard
              key={key}
              section={key}
              rows={sectionRows(profile.data, key)}
              onPress={() => router.push(`/profile/edit/${key}`)}
            />
          ))
        ) : profile.error ? (
          <EmptyState
            icon="alert-circle-outline"
            text={errorMessage(profile.error)}
            action={{ label: 'Retry', onPress: () => void profile.refetch() }}
          />
        ) : (
          <SkeletonRows count={4} height={96} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  content: { padding: tokens.spacing.margin, gap: tokens.spacing[3], paddingBottom: tokens.spacing[6] },
  header: { alignItems: 'center', gap: tokens.spacing[2], paddingBottom: tokens.spacing[3] },
  meta: { color: tokens.colors.inkSecondary },
  badge: { position: 'absolute', top: -4, right: -4, backgroundColor: tokens.colors.accent, color: tokens.colors.onAccent },
});
