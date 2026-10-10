import { DarkTheme as NavDarkTheme, type Theme as NavTheme } from 'expo-router';
import { MD3DarkTheme, type MD3Theme } from 'react-native-paper';

/** DESIGN.md tokens ("Afterhours"). The app is dark-only. */
export const tokens = {
  colors: {
    surfaceBase: '#0E0E12',
    surfaceRaised: '#18181F',
    surfaceOverlay: '#22222B',
    inkPrimary: '#F2F1F7',
    inkSecondary: '#A09FB0',
    inkDisabled: '#5A5966',
    accent: '#8B5CF6',
    accentPressed: '#7C3AED',
    onAccent: '#FFFFFF',
    voteActive: '#22C55E',
    live: '#F43F5E',
    warning: '#F59E0B',
    error: '#EF4444',
    borderHairline: '#2A2A34',
  },
  rounded: { sm: 8, md: 12, lg: 20, full: 9999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, margin: 16 },
} as const;

const c = tokens.colors;

export const paperTheme: MD3Theme = {
  ...MD3DarkTheme,
  dark: true,
  roundness: 2, // inputs: rounded.sm (Paper multiplies by 4 for most components)
  colors: {
    ...MD3DarkTheme.colors,
    primary: c.accent,
    onPrimary: c.onAccent,
    primaryContainer: c.accentPressed,
    onPrimaryContainer: c.onAccent,
    secondary: c.accent,
    onSecondary: c.onAccent,
    secondaryContainer: c.surfaceOverlay,
    onSecondaryContainer: c.inkPrimary,
    background: c.surfaceBase,
    onBackground: c.inkPrimary,
    surface: c.surfaceBase,
    onSurface: c.inkPrimary,
    surfaceVariant: c.surfaceRaised,
    onSurfaceVariant: c.inkSecondary,
    surfaceDisabled: 'rgba(242, 241, 247, 0.12)',
    onSurfaceDisabled: c.inkDisabled,
    outline: c.borderHairline,
    outlineVariant: c.borderHairline,
    error: c.error,
    onError: c.onAccent,
    inverseSurface: c.surfaceOverlay,
    inverseOnSurface: c.inkPrimary,
    inversePrimary: c.accent,
    elevation: {
      // Depth comes from tone, not shadow.
      level0: 'transparent',
      level1: c.surfaceRaised,
      level2: c.surfaceRaised,
      level3: c.surfaceOverlay,
      level4: c.surfaceOverlay,
      level5: c.surfaceOverlay,
    },
  },
};

export const navigationTheme: NavTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    primary: c.accent,
    background: c.surfaceBase,
    card: c.surfaceRaised,
    text: c.inkPrimary,
    border: c.borderHairline,
    notification: c.live,
  },
};
