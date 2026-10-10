import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/errors';
import { useAuth } from '@/auth/AuthProvider';
import { tokens } from '@/theme';
import { PrimaryButton, Screen, SecondaryButton } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** The app is blocked here until the server says the email is verified (FR-1). */
export default function CheckEmail() {
  const { account, recheck, logout } = useAuth();
  const { show } = useSnackbar();
  const [busy, setBusy] = useState<'check' | 'resend' | null>(null);

  const check = async () => {
    setBusy('check');
    try {
      const status = await recheck();
      if (status === 'unverified') show('Your email isn’t verified yet. Open the link we sent you.');
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy('resend');
    try {
      await authApi.resendVerification();
      show('Sent. Check your inbox.');
    } catch (error) {
      show(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.body}>
        <MaterialCommunityIcons name="email-check-outline" size={64} color={tokens.colors.accent} />
        <Text variant="titleLarge">Check your email</Text>
        <Text variant="bodyLarge" style={styles.lead}>
          Check your email to finish signing up. We sent a link to {account?.email ?? 'your address'}. Open it, then come
          back here.
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton onPress={check} loading={busy === 'check'} disabled={busy !== null}>
          I’ve verified
        </PrimaryButton>
        <SecondaryButton onPress={resend} loading={busy === 'resend'} disabled={busy !== null}>
          Resend
        </SecondaryButton>
        <Button onPress={() => void logout()} disabled={busy !== null}>
          Use another account
        </Button>
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
