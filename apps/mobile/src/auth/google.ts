import { appConfig, isGoogleConfigured } from '../config';

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super("Google sign-in isn't configured.");
  }
}

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

function loadModule(): GoogleModule {
  // Loaded lazily: the native module only exists in a dev/production build, not in Expo Go.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-google-signin/google-signin') as GoogleModule;
}

/**
 * Shows the Google account picker and returns an ID token for the API to verify (AD-6).
 * Returns null if the user cancelled.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!isGoogleConfigured()) throw new GoogleNotConfiguredError();
  const { GoogleSignin } = loadModule();
  GoogleSignin.configure({ webClientId: appConfig.googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;
  if (!result.data.idToken) throw new Error('Google did not return an ID token.');
  return result.data.idToken;
}

export async function googleSignOut(): Promise<void> {
  if (!isGoogleConfigured()) return;
  try {
    await loadModule().GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or module unavailable: nothing to do.
  }
}
