import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { ApiError, NetworkError } from '../api/errors';
import { tokens } from '../theme';
import { SecondaryButton } from '../ui/components';
import { useSnackbar } from '../ui/Snackbar';
import { useAuth } from './AuthProvider';
import { GoogleNotConfiguredError } from './google';

export function GoogleButton() {
  const { loginWithGoogle } = useAuth();
  const { show } = useSnackbar();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (error) {
      const known = error instanceof ApiError || error instanceof NetworkError || error instanceof GoogleNotConfiguredError;
      show(known ? (error as Error).message : 'Google sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SecondaryButton
      onPress={onPress}
      loading={busy}
      disabled={busy}
      icon={({ size }) => <MaterialCommunityIcons name="google" size={size} color={tokens.colors.inkPrimary} />}
    >
      Continue with Google
    </SecondaryButton>
  );
}
