import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Text, TouchableRipple } from 'react-native-paper';
import type { Profile } from '../api/users';
import { Chip } from '../events/components';
import { tokens } from '../theme';
import { initial } from '../ui/InviteSheet';

const c = tokens.colors;

export type SectionKey = 'public' | 'friends' | 'private' | 'music';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

/** The four profile sections, each labelled with who sees it (EXPERIENCE.md "Privacy section card"). */
export const SECTIONS: Record<SectionKey, { title: string; audience: string; icon: Icon }> = {
  public: { title: 'Public', audience: 'Everyone', icon: 'earth' },
  friends: { title: 'Friends only', audience: 'Friends', icon: 'account-multiple-outline' },
  private: { title: 'Private', audience: 'Only me', icon: 'lock-outline' },
  music: { title: 'Music preferences', audience: 'Everyone', icon: 'music-note-outline' },
};

export const SECTION_KEYS: SectionKey[] = ['public', 'friends', 'private', 'music'];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === 'string' && (SECTION_KEYS as string[]).includes(value);
}

/** "1999-04-23" → "23 April 1999" (shown in the device's locale, never shifted by timezone). */
export function formatBirthday(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Label → value lines of one section, as far as the profile carries them. */
export function sectionRows(profile: Profile, key: SectionKey): { label: string; value: string | undefined }[] {
  switch (key) {
    case 'public':
      return [
        { label: 'Bio', value: profile.public.bio },
        { label: 'City', value: profile.public.city },
      ];
    case 'friends':
      return [
        { label: 'Phone', value: profile.friends?.phone },
        { label: 'Birthday', value: profile.friends?.birthday ? formatBirthday(profile.friends.birthday) : undefined },
      ];
    case 'private':
      return [
        { label: 'Full name', value: profile.private?.fullName },
        { label: 'Address', value: profile.private?.address },
      ];
    case 'music':
      return [
        { label: 'Genres', value: profile.musicPrefs.genres.join(', ') || undefined },
        { label: 'Artists', value: profile.musicPrefs.artists.join(', ') || undefined },
      ];
  }
}

/**
 * A privacy section card: title, a chip saying who sees it, then its fields. With `onPress` it is
 * tappable (my own profile → edit); empty fields then read "Not set".
 */
export function SectionCard({
  section,
  rows,
  onPress,
  footer,
}: {
  section: SectionKey;
  rows: { label: string; value: string | undefined }[];
  onPress?: () => void;
  footer?: ReactNode;
}) {
  const meta = SECTIONS[section];
  const shown = onPress ? rows : rows.filter((r) => r.value);
  const body = (
    <View style={styles.inner}>
      <View style={styles.titleRow}>
        <Text variant="titleMedium" style={styles.title}>
          {meta.title}
        </Text>
        <Chip icon={meta.icon} label={meta.audience} />
        {onPress && <MaterialCommunityIcons name="pencil-outline" size={20} color={c.inkSecondary} />}
      </View>
      {shown.length === 0 ? (
        <Text variant="bodyMedium" style={styles.unset}>
          Nothing shared yet.
        </Text>
      ) : (
        shown.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text variant="bodySmall" style={styles.label}>
              {row.label}
            </Text>
            <Text variant="bodyLarge" style={row.value ? undefined : styles.unset}>
              {row.value ?? 'Not set'}
            </Text>
          </View>
        ))
      )}
      {footer}
    </View>
  );
  if (!onPress) return <View style={styles.card}>{body}</View>;
  return (
    <TouchableRipple
      onPress={onPress}
      style={styles.card}
      borderless
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}, visible to ${meta.audience === 'Only me' ? 'only you' : meta.audience.toLowerCase()}. Edit`}
    >
      {body}
    </TouchableRipple>
  );
}

/** A person in a list: avatar + name (tap opens their profile) and trailing actions. */
export function PersonRow({
  name,
  subtitle,
  onPress,
  right,
}: {
  name: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.person}>
      <TouchableRipple
        onPress={onPress}
        disabled={!onPress}
        style={styles.personMain}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={onPress ? `${name}${subtitle ? `, ${subtitle}` : ''}. Open profile` : undefined}
      >
        <View style={styles.personInner}>
          <Avatar.Text size={40} label={initial(name)} style={styles.avatar} color={c.inkPrimary} />
          <View style={styles.personText}>
            <Text variant="bodyLarge" numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Text variant="bodySmall" style={styles.label} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableRipple>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  person: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], minHeight: 56 },
  personMain: { flex: 1, borderRadius: tokens.rounded.sm },
  personInner: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[3], minHeight: 56 },
  personText: { flex: 1 },
  avatar: { backgroundColor: c.surfaceRaised },
  card: { backgroundColor: c.surfaceRaised, borderRadius: tokens.rounded.md, overflow: 'hidden' },
  inner: { padding: tokens.spacing[4], gap: tokens.spacing[2] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2] },
  title: { flex: 1 },
  row: { gap: 2 },
  label: { color: c.inkSecondary },
  unset: { color: c.inkDisabled },
});
