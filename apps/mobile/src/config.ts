import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

interface Extra {
  googleWebClientId?: string;
  defaultServerUrl?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const appConfig = {
  googleWebClientId: extra.googleWebClientId ?? '',
  defaultServerUrl: extra.defaultServerUrl ?? 'http://10.0.2.2:3000',
  appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0',
  platform: Platform.OS,
  device: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'unknown',
};

export const isGoogleConfigured = () => appConfig.googleWebClientId.length > 0;
