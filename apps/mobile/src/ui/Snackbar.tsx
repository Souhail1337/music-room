import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { tokens } from '../theme';

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

interface SnackbarContextValue {
  show(message: string, action?: SnackbarAction): void;
}

const SnackbarContext = createContext<SnackbarContextValue>({ show: () => undefined });

/** One global snackbar, one message at a time, 4s or until the user acts (EXPERIENCE.md component patterns). */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ message: string; action?: SnackbarAction } | null>(null);
  const show = useCallback((message: string, action?: SnackbarAction) => setCurrent({ message, action }), []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        visible={current !== null}
        onDismiss={() => setCurrent(null)}
        duration={4000}
        action={current?.action ? { label: current.action.label, onPress: current.action.onPress, textColor: tokens.colors.accent } : undefined}
        style={styles.snackbar}
        theme={{ colors: { inverseOnSurface: tokens.colors.inkPrimary } }}
      >
        {current?.message ?? ''}
      </Snackbar>
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackbarContext);

const styles = StyleSheet.create({
  snackbar: { backgroundColor: tokens.colors.surfaceOverlay, borderRadius: tokens.rounded.md },
});
