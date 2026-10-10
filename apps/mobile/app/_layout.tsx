import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { navigationTheme, paperTheme, tokens } from '@/theme';
import { SnackbarProvider } from '@/ui/Snackbar';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    // Drag-to-reorder and swipe-to-remove (playlist editor) need the gesture-handler root.
    <GestureHandlerRootView style={styles.root}>
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: tokens.colors.surfaceBase } });

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
        <Stack.Screen name="profile/edit/[section]" options={{ title: 'Edit profile' }} />
        <Stack.Screen name="friends/index" options={{ title: 'Friends' }} />
        <Stack.Screen name="users/[id]" options={{ title: '' }} />
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
        <Stack.Screen name="playlists/new" options={{ title: 'New playlist' }} />
        <Stack.Screen name="playlists/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="playlists/[id]/edit" options={{ title: 'Edit playlist' }} />
        <Stack.Screen
          name="playlists/[id]/add"
          options={{ title: 'Add track', presentation: 'modal', headerStyle: { backgroundColor: tokens.colors.surfaceOverlay } }}
        />
        <Stack.Screen
          name="playlists/[id]/invite"
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
