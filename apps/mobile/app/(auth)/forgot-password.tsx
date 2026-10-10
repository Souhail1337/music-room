import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { authApi } from '@/api/auth';
import { ApiError, errorMessage } from '@/api/errors';
import { tokens } from '@/theme';
import { Field, PrimaryButton, Screen, SecondaryButton } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Request a reset email. The new password is set from the link (a page served by the API). */
export default function ForgotPassword() {
  const { show } = useSnackbar();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(undefined);
    setBusy(true);
    try {
      await authApi.forgot(email.trim());
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VALIDATION_FAILED') setError(e.fieldErrors.email);
      else show(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <Text variant="titleLarge">Check your email</Text>
        <Text variant="bodyLarge" style={styles.lead}>
          If an account exists for {email.trim()}, we’ve sent a link to reset your password. It works once and expires in 1
          hour. Then come back and log in.
        </Text>
        <SecondaryButton onPress={() => router.back()}>Back to log in</SecondaryButton>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="bodyLarge" style={styles.lead}>
        Enter your email and we’ll send you a link to set a new password.
      </Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={error}
      />
      <PrimaryButton onPress={submit} loading={busy} disabled={busy || !email}>
        Send reset link
      </PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { color: tokens.colors.inkSecondary, marginBottom: tokens.spacing[3] },
});
