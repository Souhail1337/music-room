import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { api } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { tokens } from '@/theme';
import { PrimaryButton, Screen, SecondaryButton } from '@/ui/components';

/** Global "Server unreachable" state: Retry, or fix the Server URL. */
export default function Unreachable() {
  const { retry } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <Screen style={styles.screen}>
      <View style={styles.body}>
        <MaterialCommunityIcons name="lan-disconnect" size={64} color={tokens.colors.warning} />
        <Text variant="titleLarge">Can’t reach the server</Text>
        <Text variant="bodyLarge" style={styles.lead}>
          Check the server URL in Settings.{'\n'}
          {api.serverUrl}
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton
          loading={busy}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await retry();
            } finally {
              setBusy(false);
            }
          }}
        >
          Retry
        </PrimaryButton>
        <SecondaryButton onPress={() => router.push('/server-url')}>Server URL</SecondaryButton>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingVertical: tokens.spacing[6] },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[4] },
  lead: { color: tokens.colors.inkSecondary, textAlign: 'center' },
  actions: { gap: tokens.spacing[3] },
});
