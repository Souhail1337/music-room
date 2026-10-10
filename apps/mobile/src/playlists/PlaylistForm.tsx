import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError, errorMessage } from '../api/errors';
import type { PlaylistInfo, PlaylistInput, PlaylistLicense, PlaylistVisibility } from '../api/playlists';
import { Choice } from '../events/EventForm';
import { tokens } from '../theme';
import { Field, PrimaryButton } from '../ui/components';
import { useSnackbar } from '../ui/Snackbar';

/** Create / Edit playlist: name, description, visibility and edit license (Everyone / Invited only). */
export function PlaylistForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: PlaylistInfo;
  submitLabel: string;
  onSubmit: (input: PlaylistInput & { name: string }) => Promise<void>;
}) {
  const { show } = useSnackbar();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<PlaylistVisibility>(initial?.visibility ?? 'public');
  const [license, setLicense] = useState<PlaylistLicense>(initial?.license ?? 'everyone');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    setErrors({});
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim(), visibility, license });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(error.fieldErrors);
      else show(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <Field label="Name" value={name} onChangeText={setName} maxLength={80} error={errors.name} />
      <Field
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={500}
        error={errors.description}
      />
      <Choice
        label="Visibility"
        value={visibility}
        onChange={setVisibility}
        options={[
          { value: 'public', label: 'Public' },
          { value: 'private', label: 'Private' },
        ]}
      />
      <Choice
        label="Who can edit"
        value={license}
        onChange={setLicense}
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'invited', label: 'Invited only' },
        ]}
      />
      <PrimaryButton onPress={() => void submit()} loading={busy} disabled={busy || !name.trim()} style={styles.submit}>
        {submitLabel}
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: tokens.spacing[2] },
  submit: { marginTop: tokens.spacing[3] },
});
