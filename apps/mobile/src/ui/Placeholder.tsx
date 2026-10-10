import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { tokens } from '../theme';

/** Empty state used by tabs whose features arrive in later specs. */
export function Placeholder({
  icon,
  title,
  body,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  body: string;
}) {
  return (
    <View style={styles.wrap}>
      <MaterialCommunityIcons name={icon} size={56} color={tokens.colors.inkDisabled} />
      <Text variant="titleLarge">{title}</Text>
      <Text variant="bodyLarge" style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: tokens.spacing[3], padding: tokens.spacing[4] },
  body: { color: tokens.colors.inkSecondary, textAlign: 'center' },
});
