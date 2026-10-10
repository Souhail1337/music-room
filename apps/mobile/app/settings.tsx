import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { ApiError, NetworkError } from '@/api/errors';
import { usersApi } from '@/api/users';
import { ME_QUERY_KEY, useAuth } from '@/auth/AuthProvider';
import { getGoogleIdToken, GoogleNotConfiguredError } from '@/auth/google';
import { tokens } from '@/theme';
import { Screen, SecondaryButton } from '@/ui/components';
import { ServerUrlForm } from '@/ui/ServerUrlForm';
import { useSnackbar } from '@/ui/Snackbar';

/** Settings: Linked accounts (FR-3), Server URL (+ Test connection) and Log out. */
export default function Settings() {
  const { logout } = useAuth();
  return (
    <Screen>
      <Text variant="titleMedium" style={styles.section}>
        Linked accounts
      </Text>
      <LinkedAccounts />
      <Divider style={styles.divider} />
      <Text variant="titleMedium" style={styles.section}>
        Server URL
      </Text>
      <ServerUrlForm />
      <Divider style={styles.divider} />
      <View>
        <SecondaryButton icon="logout" onPress={() => void logout()}>
          Log out
        </SecondaryButton>
      </View>
    </Screen>
  );
}

function LinkedRow({ icon, label, linked }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; linked: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}, ${linked ? 'linked' : 'not linked'}`}>
      <MaterialCommunityIcons name={icon} size={24} color={tokens.colors.inkPrimary} />
      <Text variant="bodyLarge" style={styles.flex}>
        {label}
      </Text>
      <Text variant="bodySmall" style={styles.meta}>
        {linked ? 'Linked' : 'Not linked'}
      </Text>
    </View>
  );
}

/** Link Google to this account, so "Continue with Google" opens it too. Link-only: no unlink. */
function LinkedAccounts() {
  const queryClient = useQueryClient();
  const { show } = useSnackbar();
  const { data: me } = useQuery({ queryKey: ME_QUERY_KEY, queryFn: authApi.me });
  const [busy, setBusy] = useState(false);

  const link = async () => {
    setBusy(true);
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return; // The user closed the account picker.
      const updated = await usersApi.linkGoogle(idToken);
      queryClient.setQueryData(ME_QUERY_KEY, updated);
      show('Google account linked.');
    } catch (error) {
      const known = error instanceof ApiError || error instanceof NetworkError || error instanceof GoogleNotConfiguredError;
      show(known ? (error as Error).message : "Couldn't link Google. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.links}>
      <LinkedRow icon="email-outline" label="Email and password" linked={!!me?.hasPassword} />
      <LinkedRow icon="google" label="Google" linked={!!me?.hasGoogle} />
      {me && !me.hasGoogle && (
        <SecondaryButton
          onPress={() => void link()}
          loading={busy}
          disabled={busy}
          icon={({ size }) => <MaterialCommunityIcons name="google" size={size} color={tokens.colors.inkPrimary} />}
        >
          Link Google account
        </SecondaryButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: tokens.spacing[2] },
  divider: { marginVertical: tokens.spacing[5], backgroundColor: tokens.colors.borderHairline },
  links: { gap: tokens.spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], minHeight: 48 },
  flex: { flex: 1 },
  meta: { color: tokens.colors.inkSecondary },
});
