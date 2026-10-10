import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Appbar, Avatar, Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { ME_QUERY_KEY } from '@/auth/AuthProvider';
import { tokens } from '@/theme';
import { Screen } from '@/ui/components';

/** Minimal profile (the 4 privacy sections arrive with spec D). Settings lives in the overflow. */
export default function Profile() {
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Appbar.Action icon="cog-outline" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
          ),
        }}
      />
      <View style={styles.header}>
        <Avatar.Text
          size={72}
          label={(Array.from(me?.displayName ?? '?')[0] ?? '?').toUpperCase()}
          style={{ backgroundColor: tokens.colors.surfaceOverlay }}
          color={tokens.colors.inkPrimary}
        />
        <Text variant="titleLarge">{me?.displayName ?? ''}</Text>
        <Text variant="bodySmall" style={styles.meta}>
          {me?.email ?? ''}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: tokens.spacing[2], paddingVertical: tokens.spacing[5] },
  meta: { color: tokens.colors.inkSecondary },
});
