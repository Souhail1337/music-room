import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

interface Extra {
  googleWebClientId?: string;
  defaultServerUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const EMULATOR_HOST = '10.0.2.2';

/**
 * DEFAULT_SERVER_URL if set; otherwise the API on the machine that serves the JS bundle (Metro's host is the
 * dev machine's LAN IP on a phone running Expo Go or a dev build), falling back to the emulator's host alias.
 */
function defaultServerUrl(): string {
  if (extra.defaultServerUrl) return extra.defaultServerUrl;
  let host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') host = EMULATOR_HOST;
  return `http://${host}:3000`;
}

export const appConfig = {
  googleWebClientId: extra.googleWebClientId ?? '',
  defaultServerUrl: defaultServerUrl(),
  appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  platform: Platform.OS,
  device: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'unknown',
};

export const isGoogleConfigured = () => appConfig.googleWebClientId.length > 0;
