import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { tokens } from '@/theme';
import { Screen } from '@/ui/components';
import { ServerUrlForm } from '@/ui/ServerUrlForm';

/** Server URL, reachable before login (Welcome logo long-press, "Can't reach the server"). */
export default function ServerUrl() {
  return (
    <Screen>
      <Text variant="bodyLarge" style={styles.lead}>
        The address of the Music Room API, for example http://192.168.1.20:3000.
      </Text>
      <ServerUrlForm onSaved={() => router.canGoBack() && router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { color: tokens.colors.inkSecondary, marginBottom: tokens.spacing[3] },
});
