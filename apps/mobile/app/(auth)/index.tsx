import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { GoogleButton } from '@/auth/GoogleButton';
import { tokens } from '@/theme';
import { Logo, PrimaryButton, Screen, SecondaryButton } from '@/ui/components';

/** Welcome: first launch, logged out. Long-press the logo to set the server URL before logging in. */
export default function Welcome() {
  return (
    <Screen style={styles.screen}>
      <View style={styles.hero}>
        <Pressable
          onLongPress={() => router.push('/server-url')}
          delayLongPress={600}
          accessibilityRole="imagebutton"
          accessibilityLabel="Music Room logo. Long-press to change the server URL."
        >
          <Logo />
        </Pressable>
        <Text variant="headlineMedium" style={styles.title}>
          Music Room
        </Text>
        <Text variant="bodyLarge" style={styles.tagline}>
          Vote the queue. Build playlists together.
        </Text>
      </View>
      <View style={styles.actions}>
        <PrimaryButton onPress={() => router.push('/sign-up')}>Sign up</PrimaryButton>
        <SecondaryButton onPress={() => router.push('/log-in')}>Log in</SecondaryButton>
        <GoogleButton />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between', paddingVertical: tokens.spacing[6] },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[4] },
  title: { color: tokens.colors.inkPrimary },
  tagline: { color: tokens.colors.inkSecondary, textAlign: 'center' },
  actions: { gap: tokens.spacing[3] },
});
