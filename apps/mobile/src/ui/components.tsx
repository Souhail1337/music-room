import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { Button, HelperText, TextInput, type TextInputProps } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '../theme';

/** Single-column screen with 16dp margins on the base surface (DESIGN.md Layout). */
export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const content = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type ButtonProps = Omit<ComponentProps<typeof Button>, 'mode'>;

/** Filled violet pill, 48dp. At most one per screen. */
export function PrimaryButton({ style, contentStyle, ...props }: ButtonProps) {
  return <Button mode="contained" style={[styles.pill, style]} contentStyle={[styles.pillContent, contentStyle]} {...props} />;
}

/** Outlined pill with a hairline border, 48dp. */
export function SecondaryButton({ style, contentStyle, ...props }: ButtonProps) {
  return (
    <Button
      mode="outlined"
      textColor={tokens.colors.inkPrimary}
      style={[styles.pill, styles.outlined, style]}
      contentStyle={[styles.pillContent, contentStyle]}
      {...props}
    />
  );
}

/** Outlined text field with an inline error underneath. */
export function Field({ error, ...props }: Omit<TextInputProps, 'error'> & { error?: string }) {
  return (
    <View>
      <TextInput mode="outlined" error={!!error} {...props} />
      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>
    </View>
  );
}

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}>
      <MaterialCommunityIcons name="music-note-eighth" size={size * 0.55} color={tokens.colors.onAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.surfaceBase },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flex: 1, padding: tokens.spacing.margin, gap: tokens.spacing[2] },
  pill: { borderRadius: tokens.rounded.full },
  pillContent: { height: 48 },
  outlined: { borderColor: tokens.colors.borderHairline },
  logo: { backgroundColor: tokens.colors.accent, alignItems: 'center', justifyContent: 'center' },
});
