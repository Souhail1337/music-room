import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * App config. Values come from the environment (apps/mobile/.env, git-ignored — see .env.example):
 * - GOOGLE_WEB_CLIENT_ID: Google OAuth *web* client ID (audience of the ID token checked by the API).
 *   Empty → the Google button shows "Google sign-in isn't configured".
 * - GOOGLE_IOS_URL_SCHEME: only needed for an iOS build.
 * - DEFAULT_SERVER_URL: initial API URL; users can change it in Settings → Server URL (FR-22).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleWebClientId = process.env.GOOGLE_WEB_CLIENT_ID ?? '';
  const googleIosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME ?? '';

  return {
    ...config,
    name: 'Music Room',
    slug: 'music-room',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'musicroom',
    userInterfaceStyle: 'dark',
    backgroundColor: '#0E0E12',
    ios: {
      bundleIdentifier: 'com.musicroom.app',
    },
    android: {
      package: 'com.musicroom.app',
      adaptiveIcon: {
        backgroundColor: '#0E0E12',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0E0E12',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-secure-store',
      // The demo API runs over plain HTTP on the LAN (http://<host-ip>:3000).
      ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
      ...(googleIosUrlScheme
        ? ([['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }]] as [string, unknown][])
        : []),
    ],
    experiments: {
      reactCompiler: true,
    },
    extra: {
      googleWebClientId,
      defaultServerUrl: process.env.DEFAULT_SERVER_URL ?? 'http://10.0.2.2:3000',
    },
  };
};
