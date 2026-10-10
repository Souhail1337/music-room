import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useAuth } from '@/auth/AuthProvider';
import { ApiError, errorMessage } from '@/api/errors';
import { tokens } from '@/theme';
import { Field, PrimaryButton, Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

export default function SignUp() {
  const { signup } = useAuth();
  const { show } = useSnackbar();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const local: Record<string, string> = {};
    if (password.length < 8) local.password = 'Use at least 8 characters.';
    if (!displayName.trim()) local.displayName = 'Enter a display name.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    try {
      // On success the navigator switches to "Check your email".
      await signup({ email: email.trim(), password, displayName: displayName.trim() });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
      else show(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text variant="bodyLarge" style={styles.lead}>
        Create your account. We’ll email you a link to confirm it.
      </Text>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        error={errors.email}
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        error={errors.password}
      />
      <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} error={errors.displayName} />
      <PrimaryButton onPress={submit} loading={busy} disabled={busy}>
        Sign up
      </PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { color: tokens.colors.inkSecondary, marginBottom: tokens.spacing[3] },
});
