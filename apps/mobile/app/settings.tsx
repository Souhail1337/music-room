import { StyleSheet, View } from 'react-native';
import { Divider, Text } from 'react-native-paper';
import { useAuth } from '@/auth/AuthProvider';
import { tokens } from '@/theme';
import { Screen, SecondaryButton } from '@/ui/components';
import { ServerUrlForm } from '@/ui/ServerUrlForm';

/** Settings: Server URL (+ Test connection) and Log out. Linked accounts arrive with spec D. */
export default function Settings() {
  const { logout } = useAuth();
  return (
    <Screen>
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

const styles = StyleSheet.create({
  section: { marginBottom: tokens.spacing[2] },
  divider: { marginVertical: tokens.spacing[5], backgroundColor: tokens.colors.borderHairline },
});
