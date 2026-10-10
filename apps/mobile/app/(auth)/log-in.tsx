import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useAuth } from '@/auth/AuthProvider';
import { GoogleButton } from '@/auth/GoogleButton';
import { ApiError, errorMessage } from '@/api/errors';
import { tokens } from '@/theme';
import { Field, PrimaryButton, Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

export default function LogIn() {
  const { login } = useAuth();
  const { show } = useSnackbar();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErrors({});
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
      else show(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
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
        autoComplete="current-password"
        error={errors.password}
      />
      <View style={styles.forgot}>
        <Button compact onPress={() => router.push('/forgot-password')}>
          Forgot password?
        </Button>
      </View>
      <PrimaryButton onPress={submit} loading={busy} disabled={busy || !email || !password}>
        Log in
      </PrimaryButton>
      <GoogleButton />
    </Screen>
  );
}

const styles = StyleSheet.create({
  forgot: { alignItems: 'flex-end', marginBottom: tokens.spacing[3] },
});
