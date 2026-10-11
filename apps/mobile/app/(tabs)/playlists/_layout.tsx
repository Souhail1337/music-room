import { Stack } from 'expo-router';
import { tokens } from '@/theme';

export default function PlaylistsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.colors.surfaceBase },
        headerTintColor: tokens.colors.inkPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: tokens.colors.surfaceBase },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Playlists' }} />
    </Stack>
  );
}
