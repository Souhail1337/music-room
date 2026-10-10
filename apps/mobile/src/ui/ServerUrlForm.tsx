import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { api, normalizeServerUrl } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { tokens } from '../theme';
import { Field, PrimaryButton, SecondaryButton } from './components';
import { useSnackbar } from './Snackbar';

/** Settings → Server URL (FR-22): edit, test the connection, save. Saving a new URL logs out. */
export function ServerUrlForm({ onSaved }: { onSaved?: () => void }) {
  const { changeServerUrl } = useAuth();
  const { show } = useSnackbar();
  const [url, setUrl] = useState(api.serverUrl);
  const [result, setResult] = useState<'ok' | 'fail' | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const normalized = normalizeServerUrl(url);
  const changed = normalized !== api.serverUrl;
  const valid = /^https?:\/\/[^\s/]+/i.test(normalized);

  const test = async () => {
    setBusy('test');
    setResult((await api.ping(normalized)) ? 'ok' : 'fail');
    setBusy(null);
  };

  const save = async () => {
    setBusy('save');
    try {
      await changeServerUrl(normalized);
      show('Server URL saved.');
      onSaved?.();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="Server URL"
        value={url}
        onChangeText={(text) => {
          setUrl(text);
          setResult(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="http://192.168.1.20:3000"
        error={url && !valid ? 'Enter a URL like http://192.168.1.20:3000' : undefined}
      />
      {result && (
        <Text
          variant="bodyMedium"
          style={{ color: result === 'ok' ? tokens.colors.inkPrimary : tokens.colors.warning }}
          accessibilityLiveRegion="polite"
        >
          {result === 'ok' ? 'Connected.' : 'Can’t reach the server at this URL.'}
        </Text>
      )}
      <SecondaryButton onPress={test} loading={busy === 'test'} disabled={!valid || busy !== null}>
        Test connection
      </SecondaryButton>
      <PrimaryButton onPress={save} loading={busy === 'save'} disabled={!valid || !changed || busy !== null}>
        Save
      </PrimaryButton>
      {changed && (
        <Text variant="bodySmall" style={styles.note}>
          Saving a new server URL logs you out.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: tokens.spacing[3] },
  note: { color: tokens.colors.inkSecondary },
});
