import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { navigationTheme, paperTheme, tokens } from '@/theme';
import { SnackbarProvider } from '@/ui/Snackbar';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <PaperProvider theme={paperTheme}>
          <ThemeProvider value={navigationTheme}>
            <SnackbarProvider>
              <AuthProvider>
                <StatusBar style="light" />
                <RootNavigator />
              </AuthProvider>
            </SnackbarProvider>
          </ThemeProvider>
        </PaperProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Which screens exist depends only on the session state the server reported. */
function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'booting') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'booting') return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.colors.surfaceBase },
        headerTintColor: tokens.colors.inkPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: tokens.colors.surfaceBase },
      }}
    >
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="events/new" options={{ title: 'New event' }} />
        <Stack.Screen name="events/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="events/[id]/edit" options={{ title: 'Edit event' }} />
        {/* Sheets: one deep at most; Android back closes them first. */}
        <Stack.Screen
          name="events/[id]/suggest"
          options={{ title: 'Suggest a track', presentation: 'modal', headerStyle: { backgroundColor: tokens.colors.surfaceOverlay } }}
        />
        <Stack.Screen
          name="events/[id]/invite"
          options={{ title: 'Invite people', presentation: 'modal', headerStyle: { backgroundColor: tokens.colors.surfaceOverlay } }}
        />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unverified'}>
        <Stack.Screen name="check-email" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unreachable'}>
        <Stack.Screen name="unreachable" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Reachable before login: long-press on the Welcome logo, or from "Can't reach the server". */}
      <Stack.Screen name="server-url" options={{ title: 'Server URL' }} />
    </Stack>
  );
}
