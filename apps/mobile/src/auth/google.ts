import { TurboModuleRegistry } from 'react-native';
import { appConfig, isGoogleConfigured } from '../config';

export class GoogleNotConfiguredError extends Error {
  constructor(message = "Google sign-in isn't configured.") {
    super(message);
  }
}

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

/** False in Expo Go or a binary built without the module: requiring the JS package would then crash. */
function isNativeModuleAvailable(): boolean {
  return TurboModuleRegistry.get('RNGoogleSignin') != null;
}

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
  if (!isNativeModuleAvailable()) {
    throw new GoogleNotConfiguredError("Google sign-in isn't available in this build of the app. Use the Android build.");
  }
  const { GoogleSignin } = loadModule();
  GoogleSignin.configure({ webClientId: appConfig.googleWebClientId });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  if (result.type !== 'success') return null;
  if (!result.data.idToken) throw new Error('Google did not return an ID token.');
  return result.data.idToken;
}

export async function googleSignOut(): Promise<void> {
  if (!isGoogleConfigured() || !isNativeModuleAvailable()) return;
  try {
    await loadModule().GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or module unavailable: nothing to do.
  }
}
