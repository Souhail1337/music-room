import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { HelperText, Text } from 'react-native-paper';
import { ApiError, errorMessage } from '@/api/errors';
import { useMyProfile, useUpdateProfile } from '@/api/queries';
import type { Profile } from '@/api/users';
import { Chip, EmptyState, SkeletonRows } from '@/events/components';
import { isSectionKey, SECTIONS, type SectionKey } from '@/profile/components';
import { fieldErrors, toUpdate, type Values } from '@/profile/form';
import { tokens } from '@/theme';
import { Field, PrimaryButton, Screen } from '@/ui/components';
import { useSnackbar } from '@/ui/Snackbar';

/** Edit one profile section (FR-6). The server owns validation; its per-field errors show inline. */
export default function EditProfileSection() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const profile = useMyProfile();

  if (!isSectionKey(section)) {
    return (
      <Screen>
        <EmptyState icon="alert-circle-outline" text="This section doesn't exist." />
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: `Edit ${SECTIONS[section].title.toLowerCase()}` }} />
      {profile.data ? (
        // Rendered once the profile has loaded; keyed by section so switching sections starts a fresh form.
        <SectionForm key={section} section={section} profile={profile.data} />
      ) : profile.error ? (
        <EmptyState icon="alert-circle-outline" text={errorMessage(profile.error)} action={{ label: 'Retry', onPress: () => void profile.refetch() }} />
      ) : (
        <SkeletonRows count={3} />
      )}
    </Screen>
  );
}

function initialValues(section: SectionKey, p: Profile): Values {
  switch (section) {
    case 'public':
      return { displayName: p.displayName, bio: p.public.bio ?? '', city: p.public.city ?? '' };
    case 'friends':
      return { phone: p.friends?.phone ?? '', birthday: p.friends?.birthday ?? '' };
    case 'private':
      return { fullName: p.private?.fullName ?? '', address: p.private?.address ?? '' };
    case 'music':
      return { genres: p.musicPrefs.genres.join(', '), artists: p.musicPrefs.artists.join(', ') };
  }
}

function SectionForm({ section, profile }: { section: SectionKey; profile: Profile }) {
  const { show } = useSnackbar();
  const update = useUpdateProfile();
  const [values, setValues] = useState<Values>(() => initialValues(section, profile));
  const [errors, setErrors] = useState<Values>({});
  const set = (key: string) => (text: string) => setValues((v) => ({ ...v, [key]: text }));
  const meta = SECTIONS[section];

  const save = async () => {
    setErrors({});
    try {
      await update.mutateAsync(toUpdate(section, values));
      show('Profile updated.');
      router.back();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(fieldErrors(error));
      else show(errorMessage(error));
    }
  };

  const field = (key: string, label: string, props: Partial<ComponentProps<typeof Field>> = {}) => (
    <Field label={label} value={values[key]} onChangeText={set(key)} error={errors[key]} {...props} />
  );

  return (
    <View style={styles.form}>
      <View style={styles.audience}>
        <Text variant="bodyMedium" style={styles.meta}>
          Who sees this
        </Text>
        <Chip icon={meta.icon} label={meta.audience} />
      </View>
      {section === 'public' && (
        <>
          {field('displayName', 'Display name', { maxLength: 40 })}
          {field('bio', 'Bio', { maxLength: 280, multiline: true })}
          {field('city', 'City', { maxLength: 60 })}
        </>
      )}
      {section === 'friends' && (
        <>
          {field('phone', 'Phone', { maxLength: 30, keyboardType: 'phone-pad' })}
          {field('birthday', 'Birthday (YYYY-MM-DD)', { maxLength: 10, keyboardType: 'numbers-and-punctuation', placeholder: '1999-04-23' })}
        </>
      )}
      {section === 'private' && (
        <>
          {field('fullName', 'Full name', { maxLength: 80 })}
          {field('address', 'Address', { maxLength: 200, multiline: true })}
        </>
      )}
      {section === 'music' && (
        <>
          {field('genres', 'Genres', { placeholder: 'House, Funk' })}
          {field('artists', 'Artists', { placeholder: 'Daft Punk, Justice' })}
          <HelperText type="info" visible>
            Separate with commas. Up to 10 of each.
          </HelperText>
        </>
      )}
      <PrimaryButton
        onPress={() => void save()}
        loading={update.isPending}
        disabled={update.isPending || (section === 'public' && !values.displayName.trim())}
        style={styles.submit}
      >
        Save
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: tokens.spacing[2] },
  audience: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing[2], marginBottom: tokens.spacing[2] },
  meta: { color: tokens.colors.inkSecondary },
  submit: { marginTop: tokens.spacing[3] },
});
