import { Stack } from 'expo-router';
import { tokens } from '@/theme';

export default function AuthLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ title: 'Sign up' }} />
      <Stack.Screen name="log-in" options={{ title: 'Log in' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Forgot password' }} />
    </Stack>
  );
}
