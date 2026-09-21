import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { User } from '../../types/domain';
import type { RuntimeState } from '../../runtime';
import { uploadUserAvatar } from '../../services/userProfileService';
import { colors, radius, space, TOUCH } from './theme';
import { Button, Card, Choice, Divider, ScreenBrand, Sheet, Txt } from './ui';
import { goalLabel, limitationLabel } from './copy';
import type { SyncStatus } from './useRuntimeController';

type Props = {
  user: User;
  state: RuntimeState;
  sync: SyncStatus;
  onEditSource: () => void;
  onSaveProfile: (profile: User) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
};

const Fact = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.fact} accessible accessibilityLabel={`${label}: ${value}`}>
    <Txt variant="label" tone="muted" style={styles.factLabel}>{label}</Txt>
    <Txt variant="code" style={styles.flex}>{value}</Txt>
  </View>
);

const Field = ({ label, value, onChangeText, keyboardType = 'default', suffix }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
  suffix?: string;
}) => (
  <View style={styles.field}>
    <Txt variant="label" tone="muted">{label}</Txt>
    <View style={styles.inputRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        returnKeyType="done"
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        accessibilityLabel={label}
      />
      {suffix ? <Txt variant="mono" tone="muted">{suffix}</Txt> : null}
    </View>
  </View>
);

export const AccountSurface = ({ user, state, sync, onEditSource, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(user.name ?? '');
  const [sex, setSex] = useState<User['sex']>(user.sex);
  const [experience, setExperience] = useState<User['experienceLevel']>(user.experienceLevel);
  const [age, setAge] = useState(String(user.age));
  const [height, setHeight] = useState(String(user.heightCm));
  const [weight, setWeight] = useState(user.weightKg ? String(user.weightKg) : '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarPath, setAvatarPath] = useState(user.avatarPath);
  const source = state.source;
  const initials = useMemo(() => (name || 'Athlete').trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), [name]);

  useEffect(() => {
    setName(user.name ?? '');
    setSex(user.sex);
    setExperience(user.experienceLevel);
    setAge(String(user.age));
    setHeight(String(user.heightCm));
    setWeight(user.weightKg ? String(user.weightKg) : '');
    setAvatarUrl(user.avatarUrl);
    setAvatarPath(user.avatarPath);
  }, [user]);

  if (!source) return null;

  const openProfileEditor = () => {
    setName(user.name ?? '');
    setSex(user.sex);
    setExperience(user.experienceLevel);
    setAge(String(user.age));
    setHeight(String(user.heightCm));
    setWeight(user.weightKg ? String(user.weightKg) : '');
    setAvatarUrl(user.avatarUrl);
    setAvatarPath(user.avatarPath);
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    const ageValue = Number.parseInt(age, 10);
    const heightValue = Number.parseInt(height, 10);
    const weightValue = weight.trim() ? Number.parseFloat(weight) : undefined;
    if (!name.trim()) { Alert.alert('Name required', 'Enter the name you want shown in the app.'); return; }
    if (!Number.isFinite(ageValue) || ageValue < 13 || ageValue > 100) { Alert.alert('Check age', 'Age must be between 13 and 100.'); return; }
    if (!Number.isFinite(heightValue) || heightValue < 100 || heightValue > 250) { Alert.alert('Check height', 'Height must be between 100 and 250 cm.'); return; }
    if (weightValue !== undefined && (!Number.isFinite(weightValue) || weightValue < 25 || weightValue > 400)) { Alert.alert('Check weight', 'Enter a weight between 25 and 400 kg.'); return; }
    setSavingProfile(true);
    try {
      await onSaveProfile({ ...user, name: name.trim(), sex, experienceLevel: experience, age: ageValue, heightCm: heightValue, weightKg: weightValue, avatarUrl, avatarPath });
      setEditingProfile(false);
    } catch (error: any) {
      Alert.alert('Profile not saved', error?.message ?? 'Try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const chooseAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') { Alert.alert('Photo access needed', 'Allow photo access to choose a profile image.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) return;
      setUploadingAvatar(true);
      const uploaded = await uploadUserAvatar(user.id, uri);
      setAvatarPath(uploaded.path);
      setAvatarUrl(uploaded.signedUrl);
    } catch (error: any) {
      Alert.alert('Photo not updated', error?.message ?? 'Try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const confirmSignOut = () => Alert.alert(
    'Sign out?',
    sync === 'synced' ? 'Your training data is saved.' : 'Some changes are still stored on this device and may not have synced.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void onLogout() }]
  );

  const confirmDelete = () => Alert.alert(
    'Delete account?',
    'Your profile, training data, and account will be permanently deleted. This cannot be undone.',
    [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Delete account', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try { await onDeleteAccount(); }
        catch (error: any) { Alert.alert('Account not deleted', error?.message ?? 'Try again.'); }
        finally { setDeleting(false); }
      },
    }]
  );

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ScreenBrand name="account" />

        <View style={styles.section}>
          <Txt variant="label" tone="muted">PROFILE</Txt>
          <Card>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} /> : <Txt variant="heading" tone="accent">{initials}</Txt>}
              </View>
              <View style={styles.flex}>
                <Txt variant="heading">{user.name?.trim() || 'Athlete'}</Txt>
                <Txt variant="mono" tone="secondary">{user.experienceLevel} · {user.age} yr · {user.heightCm} cm{user.weightKg ? ` · ${user.weightKg} kg` : ''}</Txt>
              </View>
            </View>
            <Button label="Edit profile" variant="secondary" icon="person-outline" onPress={openProfileEditor} />
          </Card>
        </View>

        <View style={styles.section}>
          <Txt variant="label" tone="muted">TRAINING SOURCE</Txt>
          <Card>
            <Fact label="goal" value={goalLabel(source.goal)} />
            <Fact label="schedule" value={`${source.daysPerWeek} days · ${source.sessionMinutes} min`} />
            <Fact label="equipment" value={source.equipment.includes('barbell') ? 'full gym' : 'dumbbells + bench'} />
            <Fact label="limits" value={source.limitations.length ? source.limitations.map(limitationLabel).join(', ') : 'none'} />
            <Button label="Edit training source" variant="secondary" icon="options-outline" onPress={onEditSource} />
          </Card>
        </View>

        <View style={styles.section}>
          <Txt variant="label" tone="muted">ACCOUNT</Txt>
          <Card style={styles.accountCard}>
            <Pressable accessibilityRole="button" onPress={confirmSignOut} style={({ pressed }) => [styles.accountAction, pressed && styles.pressed]}>
              <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
              <Txt variant="code" style={styles.flex}>Sign out</Txt>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            <Divider />
            <Pressable accessibilityRole="button" disabled={deleting} onPress={confirmDelete} style={({ pressed }) => [styles.accountAction, pressed && styles.pressed, deleting && styles.disabled]}>
              {deleting ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="trash-outline" size={20} color={colors.danger} />}
              <Txt variant="code" tone="danger" style={styles.flex}>{deleting ? 'Deleting account…' : 'Delete account'}</Txt>
              {!deleting ? <Ionicons name="chevron-forward" size={18} color={colors.danger} /> : null}
            </Pressable>
          </Card>
        </View>
      </ScrollView>

      <Sheet visible={editingProfile} onClose={() => setEditingProfile(false)} title="edit profile">
        <View style={styles.avatarEditor}>
          <View style={styles.avatarLarge}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Txt variant="title" tone="accent">{initials}</Txt>}
          </View>
          <Button label={uploadingAvatar ? 'Uploading…' : 'Change photo'} variant="ghost" disabled={uploadingAvatar} onPress={() => void chooseAvatar()} />
        </View>
        <Field label="name" value={name} onChangeText={setName} />
        <Field label="age" value={age} onChangeText={(value) => setAge(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix="years" />
        <Field label="height" value={height} onChangeText={(value) => setHeight(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix="cm" />
        <Field label="weight" value={weight} onChangeText={(value) => setWeight(value.replace(/[^0-9.]/g, '').slice(0, 6))} keyboardType="decimal-pad" suffix="kg" />
        <Txt variant="label" tone="muted">SEX</Txt>
        <View style={styles.choices}>
          {(['male', 'female', 'other'] as const).map((value) => <Choice key={value} compact code label={value} selected={sex === value} onPress={() => setSex(value)} />)}
        </View>
        <Txt variant="label" tone="muted">EXPERIENCE</Txt>
        <View style={styles.choices}>
          {(['beginner', 'intermediate', 'advanced'] as const).map((value) => <Choice key={value} compact code label={value} selected={experience === value} onPress={() => setExperience(value)} />)}
        </View>
        <Button label="Save profile" loading={savingProfile} onPress={() => void saveProfile()} />
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  page: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg },
  section: { gap: space.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarLarge: { width: 82, height: 82, borderRadius: 41, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarImage: { width: '100%', height: '100%' },
  avatarEditor: { alignItems: 'center', gap: space.xs },
  fact: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  factLabel: { width: 76 },
  accountCard: { paddingVertical: 0, gap: 0 },
  accountAction: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md },
  field: { gap: space.xs },
  inputRow: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: TOUCH, color: colors.text, fontSize: 16, paddingVertical: space.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
