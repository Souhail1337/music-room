import * as SecureStore from 'expo-secure-store';

const KEYS = {
  serverUrl: 'mr.serverUrl',
  accessToken: 'mr.accessToken',
  refreshToken: 'mr.refreshToken',
} as const;

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/** Device storage: the server URL and the session tokens (expo-secure-store, AD-6 / AD-11). */
export const storage = {
  getServerUrl: () => SecureStore.getItemAsync(KEYS.serverUrl),
  setServerUrl: (url: string) => SecureStore.setItemAsync(KEYS.serverUrl, url),

  async getTokens(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.refreshToken),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  },
  async setTokens(tokens: StoredTokens): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken),
      SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken),
    ]);
  },
  async clearTokens(): Promise<void> {
    await Promise.all([SecureStore.deleteItemAsync(KEYS.accessToken), SecureStore.deleteItemAsync(KEYS.refreshToken)]);
  },
};
