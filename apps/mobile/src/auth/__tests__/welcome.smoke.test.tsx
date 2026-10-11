import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Welcome from '../../../app/(auth)/index';
import { paperTheme } from '../../theme';
import { installFetch, jsonResponse } from '../../testing/fakes';
import { AuthProvider } from '../AuthProvider';

jest.mock('expo-secure-store', () => require('../../testing/fakes').secureStoreMock);
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));
jest.mock('../google', () => ({
  getGoogleIdToken: jest.fn(async () => null),
  googleSignOut: jest.fn(async () => undefined),
  GoogleNotConfiguredError: class extends Error {},
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Smoke test (NFR-14): the first screen a new user sees renders with the real providers and navigates. */
describe('Welcome screen', () => {
  beforeEach(() => {
    installFetch(() => jsonResponse(200, { status: 'ok' }));
  });

  it('renders the brand and the three ways in', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <QueryClientProvider client={new QueryClient()}>
          <PaperProvider theme={paperTheme}>
            <AuthProvider>
              <Welcome />
            </AuthProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Music Room')).toBeOnTheScreen();
    expect(screen.getByText('Vote the queue. Build playlists together.')).toBeOnTheScreen();
    expect(screen.getByText('Sign up')).toBeOnTheScreen();
    expect(screen.getByText('Log in')).toBeOnTheScreen();
    expect(screen.getByText('Continue with Google')).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByText('Sign up'));
    expect(router.push).toHaveBeenCalledWith('/sign-up');
    await user.press(screen.getByText('Log in'));
    expect(router.push).toHaveBeenCalledWith('/log-in');
  });
});
