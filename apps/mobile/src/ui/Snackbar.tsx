import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { tokens } from '../theme';

interface SnackbarContextValue {
  show(message: string): void;
}

const SnackbarContext = createContext<SnackbarContextValue>({ show: () => undefined });

/** One global snackbar, one message at a time, 4s (EXPERIENCE.md component patterns). */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const show = useCallback((next: string) => setMessage(next), []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        visible={message !== null}
        onDismiss={() => setMessage(null)}
        duration={4000}
        style={styles.snackbar}
        theme={{ colors: { inverseOnSurface: tokens.colors.inkPrimary } }}
      >
        {message ?? ''}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackbarContext);

const styles = StyleSheet.create({
  snackbar: { backgroundColor: tokens.colors.surfaceOverlay, borderRadius: tokens.rounded.md },
});
