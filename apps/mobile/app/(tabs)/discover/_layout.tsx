import { Stack } from 'expo-router';
import { tokens } from '@/theme';

export default function DiscoverLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.colors.surfaceBase },
        headerTintColor: tokens.colors.inkPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: tokens.colors.surfaceBase },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Discover' }} />
    </Stack>
  );
}
