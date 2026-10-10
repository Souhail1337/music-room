import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip as PaperChip, Text } from 'react-native-paper';
import { ApiError, errorMessage } from '../api/errors';
import type { Coords, EventInfo, EventInput, License, Visibility } from '../api/events';
import { currentPosition } from '../location';
import { tokens } from '../theme';
import { Field, PrimaryButton, SecondaryButton } from '../ui/components';
import { useSnackbar } from '../ui/Snackbar';
import { hhmm } from './copy';

const RADII = [50, 100, 250] as const;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

function dayLabel(day: Date): string {
  const today = startOfDay(new Date());
  if (sameDay(day, today)) return 'Today';
  if (sameDay(day, addDays(today, 1))) return 'Tomorrow';
  return day.toDateString().slice(0, 10);
}

/** Local day + HH:MM → UTC instant. An end at or before the start rolls over to the next day. */
function toWindow(day: Date, start: string, end: string): { startsAt: string; endsAt: string } | null {
  const s = TIME.exec(start);
  const e = TIME.exec(end);
  if (!s || !e) return null;
  const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(s[1]), Number(s[2]));
  let endsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(e[1]), Number(e[2]));
  if (endsAt <= startsAt) endsAt = addDays(endsAt, 1);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function Choice<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View style={styles.group} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="titleSmall" style={styles.label}>
        {label}
      </Text>
      <View style={styles.chips}>
        {options.map((o) => (
          <PaperChip
            key={String(o.value)}
            selected={o.value === value}
            showSelectedCheck={false}
            onPress={() => onChange(o.value)}
            style={[styles.chip, o.value === value && styles.chipSelected]}
            textStyle={{ color: o.value === value ? tokens.colors.onAccent : tokens.colors.inkSecondary }}
            accessibilityRole="radio"
            accessibilityState={{ selected: o.value === value }}
          >
            {o.label}
          </PaperChip>
        ))}
      </View>
    </View>
  );
}

/** Create / Edit event: name, description, visibility, vote license and — for on-site — venue and window. */
export function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: EventInfo;
  submitLabel: string;
  onSubmit: (input: EventInput & { name: string }) => Promise<void>;
}) {
  const { show } = useSnackbar();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [license, setLicense] = useState<License>(initial?.license ?? 'everyone');
  const [venue, setVenue] = useState<Coords | null>(
    initial?.lat != null && initial?.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [radiusM, setRadiusM] = useState<number>(initial?.radiusM ?? 100);
  const initialStart = initial?.startsAt ? new Date(initial.startsAt) : null;
  const [day, setDay] = useState<Date>(startOfDay(initialStart ?? new Date()));
  const [start, setStart] = useState(initial?.startsAt ? hhmm(initial.startsAt) : '20:00');
  const [end, setEnd] = useState(initial?.endsAt ? hhmm(initial.endsAt) : '23:00');
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const today = startOfDay(new Date());
  const days = [today, addDays(today, 1)];
  if (!days.some((d) => sameDay(d, day))) days.unshift(day);

  const pickMyLocation = async () => {
    setLocating(true);
    try {
      const coords = await currentPosition();
      if (coords) setVenue(coords);
      else show('Allow location to set the venue.');
    } catch (error) {
      show(errorMessage(error));
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const local: Record<string, string> = {};
    const input: EventInput & { name: string } = { name: name.trim(), description: description.trim(), visibility, license };
    if (license === 'on_site') {
      const window = toWindow(day, start, end);
      if (!venue) local.lat = 'Set the venue location.';
      if (!TIME.test(start)) local.startsAt = 'Use HH:MM, e.g. 20:00.';
      if (!TIME.test(end)) local.endsAt = 'Use HH:MM, e.g. 02:00.';
      if (venue && window) Object.assign(input, { lat: venue.lat, lng: venue.lng, radiusM, ...window });
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(input);
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
        label="Who can vote"
        value={license}
        onChange={setLicense}
        options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'invited', label: 'Invited only' },
          { value: 'on_site', label: 'On-site' },
        ]}
      />
      {license === 'on_site' && (
        <View style={styles.onSite}>
          <Text variant="titleSmall" style={styles.label}>
            Venue
          </Text>
          <SecondaryButton icon="crosshairs-gps" onPress={() => void pickMyLocation()} loading={locating} disabled={locating}>
            {venue ? 'Update to my current location' : 'Use my current location'}
          </SecondaryButton>
          <Text variant="bodySmall" style={{ color: errors.lat ? tokens.colors.error : tokens.colors.inkSecondary }}>
            {errors.lat ?? (venue ? `Venue set (${venue.lat.toFixed(4)}, ${venue.lng.toFixed(4)}).` : 'Stand at the venue and tap the button.')}
          </Text>
          <Choice
            label="Radius"
            value={radiusM}
            onChange={setRadiusM}
            options={RADII.map((r) => ({ value: r, label: `${r} m` }))}
          />
          <Choice
            label="Day"
            value={day.getTime()}
            onChange={(t) => setDay(new Date(t))}
            options={days.map((d) => ({ value: d.getTime(), label: dayLabel(d) }))}
          />
          <View style={styles.times}>
            <View style={styles.time}>
              <Field label="Voting opens" value={start} onChangeText={setStart} placeholder="20:00" keyboardType="numbers-and-punctuation" maxLength={5} error={errors.startsAt} />
            </View>
            <View style={styles.time}>
              <Field label="Voting closes" value={end} onChangeText={setEnd} placeholder="02:00" keyboardType="numbers-and-punctuation" maxLength={5} error={errors.endsAt} />
            </View>
          </View>
        </View>
      )}
      <PrimaryButton onPress={() => void submit()} loading={busy} disabled={busy || !name.trim()} style={styles.submit}>
        {submitLabel}
      </PrimaryButton>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: tokens.spacing[2] },
  group: { gap: tokens.spacing[2], marginBottom: tokens.spacing[3] },
  label: { color: tokens.colors.inkSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing[2] },
  chip: { borderRadius: tokens.rounded.full, backgroundColor: tokens.colors.surfaceOverlay, minHeight: 40, justifyContent: 'center' },
  chipSelected: { backgroundColor: tokens.colors.accent },
  onSite: { gap: tokens.spacing[2] },
  times: { flexDirection: 'row', gap: tokens.spacing[3] },
  time: { flex: 1 },
  submit: { marginTop: tokens.spacing[3] },
});
