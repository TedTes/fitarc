import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User } from '../types/domain';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';
import { useScreenAnimation } from '../hooks/useScreenAnimation';
import * as ImagePicker from 'expo-image-picker';
import { uploadUserAvatar } from '../services/userProfileService';

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  bg:        '#0A0E27',
  surface:   '#151932',
  surface2:  '#1A1F3A',
  primary:   '#6C63FF',
  text:      '#FFFFFF',
  textSec:   '#8B93B0',
  textMuted: '#5A6178',
  border:    '#2A2F4F',
  danger:    '#FF6B6B',
  rowBorder: 'rgba(255,255,255,0.06)',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
type ProfileScreenProps = {
  user: User;
  onSave: (user: User) => void;
  onClose: () => void;
  onLogout?: () => void;
  onDeleteAccount?: () => Promise<void> | void;
};

// ─── CardRow ──────────────────────────────────────────────────────────────────
const CardRow: React.FC<{
  icon: string;
  label: string;
  isLast?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}> = ({ icon, label, isLast, onPress, children }) => {
  const inner = (
    <View style={[cr.row, !isLast && cr.rowBorder]}>
      <View style={cr.left}>
        <View style={cr.iconBox}><Text style={cr.iconText}>{icon}</Text></View>
        <Text style={cr.label}>{label}</Text>
      </View>
      <View style={cr.right}>{children}</View>
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  return inner;
};

const cr = StyleSheet.create({
  row:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  left:      { flexDirection: 'row', alignItems: 'center', flex: 1 },
  right:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBox:   { width: 28, height: 28, borderRadius: 7, backgroundColor: 'rgba(108,99,255,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  iconText:  { fontSize: 14 },
  label:     { fontSize: 14, color: '#FFFFFF', fontWeight: '500' },
});

// ─── SectionCard ─────────────────────────────────────────────────────────────
const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={sc.wrap}>
    <Text style={sc.title}>{title}</Text>
    <View style={sc.card}>{children}</View>
  </View>
);

const sc = StyleSheet.create({
  wrap:  { marginHorizontal: 16, marginBottom: 20 },
  title: { fontSize: 11, fontWeight: '700', color: '#5A6178', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  card:  { backgroundColor: '#151932', borderRadius: 14, borderWidth: 1, borderColor: '#2A2F4F', overflow: 'hidden' },
});

// ─── Main component ───────────────────────────────────────────────────────────
export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onSave,
  onLogout,
  onDeleteAccount,
}) => {
  const { headerStyle, contentStyle } = useScreenAnimation();

  // ── identity state ──
  const [name,     setName]     = useState(user.name ?? '');
  const [sex,      setSex]      = useState<'male' | 'female' | 'other'>(user.sex);
  const [age,      setAge]      = useState(user.age.toString());
  const [heightCm, setHeightCm] = useState(user.heightCm.toString());
  const [weightKg, setWeightKg] = useState(user.weightKg?.toString() ?? '');
  const [avatarUrl,  setAvatarUrl]  = useState<string | undefined>(user.avatarUrl);
  const [avatarPath, setAvatarPath] = useState<string | undefined>(user.avatarPath);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError,        setDeleteError]        = useState<string | null>(null);

  const avatarInitials = useMemo(
    () => name.trim().split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase() || 'A',
    [name]
  );

  // ── autosave ──
  const [saved, setSaved] = useState(false);
  const savedOpacity = useRef(new Animated.Value(0)).current;

  const showSavedBadge = useCallback(() => {
    setSaved(true);
    savedOpacity.setValue(1);
    Animated.sequence([
      Animated.delay(1200),
      Animated.timing(savedOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setSaved(false));
  }, [savedOpacity]);

  const persistProfile = useCallback(
    (opts?: { showErrors?: boolean }) => {
      const ageNum    = parseInt(age, 10);
      const heightNum = parseInt(heightCm, 10);
      if (!age || isNaN(ageNum) || ageNum < 13 || ageNum > 100) {
        if (opts?.showErrors) Alert.alert('Invalid Input', 'Please enter a valid age (13–100)');
        return false;
      }
      if (!heightCm || isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
        if (opts?.showErrors) Alert.alert('Invalid Input', 'Please enter a valid height (100–250 cm)');
        return false;
      }
      onSave({
        ...user,
        name: name.trim(),
        sex,
        age: ageNum,
        heightCm: heightNum,
        weightKg: parseFloat(weightKg) || undefined,
        avatarUrl,
        avatarPath,
      });
      return true;
    },
    [age, heightCm, weightKg, name, sex, avatarUrl, avatarPath, onSave, user]
  );

  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => {
      const ok = persistProfile({ showErrors: false });
      if (ok) showSavedBadge();
    }, 800);
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); };
  }, [sex, age, heightCm, weightKg, persistProfile, showSavedBadge]);

  const handlePickAvatar = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to photos to upload an avatar.');
        return;
      }
      const mediaTypes = (ImagePicker as any).MediaType?.Images ?? ImagePicker.MediaTypeOptions.Images;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes, allowsEditing: true, quality: 0.8, aspect: [1, 1],
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) return;
      setIsUploadingAvatar(true);
      const { path, signedUrl } = await uploadUserAvatar(user.id, asset.uri);
      setAvatarPath(path);
      setAvatarUrl(signedUrl);
      onSave({ ...user, sex, age: parseInt(age, 10) || user.age, heightCm: parseInt(heightCm, 10) || user.heightCm, weightKg: parseFloat(weightKg) || undefined, avatarUrl: signedUrl, avatarPath: path });
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message || 'Unable to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }, [age, heightCm, weightKg, onSave, sex, user]);

  const confirmDeleteAccount = useCallback(() => {
    if (!onDeleteAccount || isDeletingAccount) return;
    Alert.alert('Delete account?', 'This will permanently delete your account and data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setIsDeletingAccount(true);
          setDeleteError(null);
          try { await onDeleteAccount(); }
          catch (err: any) { setDeleteError(err?.message || 'Unable to delete your account. Please try again.'); }
          finally { setIsDeletingAccount(false); }
        },
      },
    ]);
  }, [isDeletingAccount, onDeleteAccount]);

  const handleDeleteRetry = useCallback(async () => {
    if (!onDeleteAccount) return;
    setIsDeletingAccount(true);
    setDeleteError(null);
    try { await onDeleteAccount(); setDeleteError(null); }
    catch (err: any) { setDeleteError(err?.message || 'Unable to delete your account.'); }
    finally { setIsDeletingAccount(false); }
  }, [onDeleteAccount]);

  // ── physique level label (read-only from user prop) ──
  const physiqueLevels = useMemo(() => getPhysiqueLevelsBySex(user.sex), [user.sex]);
  const currentPhysiqueLabel =
    physiqueLevels.find((l) => l.id === (user.currentPhysiqueLevel ?? 1))?.name ??
    `Level ${user.currentPhysiqueLevel ?? 1}`;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>

        {/* Autosave badge */}
        {saved && (
          <Animated.View style={[styles.savedBadge, { opacity: savedOpacity }]}>
            <Text style={styles.savedBadgeText}>Saved</Text>
          </Animated.View>
        )}

        <Animated.ScrollView
          style={contentStyle}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.headerSpacer, headerStyle]} />

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} disabled={isUploadingAvatar} activeOpacity={0.8}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                : <Text style={styles.avatarInitials}>{avatarInitials}</Text>
              }
              <View style={styles.avatarCameraOverlay}>
                {isUploadingAvatar
                  ? <ActivityIndicator size="small" color={C.text} />
                  : <Text style={styles.avatarCameraIcon}>📷</Text>
                }
              </View>
            </TouchableOpacity>

            <Text style={styles.heroName}>{name.trim() || 'Your Name'}</Text>

            <View style={styles.heroBadges}>
              <View style={styles.badgePrimary}>
                <Text style={styles.badgePrimaryText}>{currentPhysiqueLabel}</Text>
              </View>
            </View>
          </View>

          {/* ── Stats Strip ───────────────────────────────────────────────── */}
          <View style={styles.statsStrip}>
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Age</Text>
              <Text style={styles.statValue}>{age || '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Height</Text>
              <Text style={styles.statValue}>{heightCm ? `${heightCm} cm` : '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>Weight</Text>
              <Text style={styles.statValue}>{weightKg ? `${weightKg} kg` : '—'}</Text>
            </View>
          </View>

          {/* ── PROFILE ───────────────────────────────────────────────────── */}
          <SectionCard title="Profile">
            <CardRow icon="🪪" label="Name">
              <TextInput
                style={styles.inlineInput}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
              />
            </CardRow>

            <CardRow icon="👤" label="Sex">
              <View style={styles.segmented}>
                {(['male', 'female', 'other'] as const).map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.segBtn, sex === option && styles.segBtnActive]}
                    onPress={() => setSex(option)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.segBtnText, sex === option && styles.segBtnTextActive]}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </CardRow>

            <CardRow icon="🎂" label="Age">
              <TextInput
                style={styles.inlineInput}
                value={age}
                onChangeText={setAge}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                maxLength={3}
              />
            </CardRow>

            <CardRow icon="📏" label="Height">
              <TextInput
                style={styles.inlineInput}
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="number-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                maxLength={3}
              />
              <Text style={styles.unitLabel}>cm</Text>
            </CardRow>

            <CardRow icon="⚖️" label="Weight" isLast>
              <TextInput
                style={styles.inlineInput}
                value={weightKg}
                onChangeText={setWeightKg}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                maxLength={6}
              />
              <Text style={styles.unitLabel}>kg</Text>
            </CardRow>
          </SectionCard>

          {/* ── ACCOUNT ───────────────────────────────────────────────────── */}
          {onLogout && (
            <SectionCard title="Account">
              <Pressable
                style={({ pressed }) => [styles.accountRow, pressed && styles.accountRowPressed]}
                onPress={onLogout}
              >
                <View style={cr.left}>
                  <View style={cr.iconBox}><Text style={cr.iconText}>🚪</Text></View>
                  <Text style={cr.label}>Log Out</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>

              {onDeleteAccount && (
                <TouchableOpacity
                  style={styles.deleteAccountRow}
                  onPress={confirmDeleteAccount}
                  disabled={isDeletingAccount}
                  activeOpacity={0.7}
                >
                  <View style={cr.left}>
                    <View style={[cr.iconBox, styles.dangerIconBox]}><Text style={cr.iconText}>🗑️</Text></View>
                    <Text style={[cr.label, styles.dangerText]}>Delete Account</Text>
                  </View>
                  {isDeletingAccount && <ActivityIndicator size="small" color={C.danger} />}
                </TouchableOpacity>
              )}
            </SectionCard>
          )}

          <View style={{ height: 80 }} />
        </Animated.ScrollView>

        {/* ── Delete Account overlay ──────────────────────────────────────── */}
        <Modal
          animationType="fade"
          transparent
          visible={isDeletingAccount || !!deleteError}
          onRequestClose={() => setDeleteError(null)}
        >
          <View style={styles.deleteOverlay}>
            <View style={styles.deleteCard}>
              {isDeletingAccount ? (
                <>
                  <ActivityIndicator size="large" color={C.primary} />
                  <Text style={styles.deleteCardTitle}>Deleting your account…</Text>
                  <Text style={styles.deleteCardBody}>This may take a few seconds.</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.deleteCardTitle, { color: C.danger }]}>Delete failed</Text>
                  <Text style={styles.deleteCardBody}>
                    {deleteError || 'Unable to delete your account. Please try again.'}
                  </Text>
                  <View style={styles.deleteCardActions}>
                    <TouchableOpacity style={styles.deleteCardCancelBtn} onPress={() => setDeleteError(null)}>
                      <Text style={styles.deleteCardCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteCardRetryBtn} onPress={handleDeleteRetry}>
                      <Text style={styles.deleteCardRetryText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </Modal>

      </LinearGradient>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  gradient:      { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 16 },
  headerSpacer:  { height: 8 },

  savedBadge:     { position: 'absolute', top: 52, right: 20, zIndex: 99, backgroundColor: '#00F5A0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  savedBadgeText: { fontSize: 12, fontWeight: '700', color: '#000' },

  hero:               { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
  avatarWrap:         { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(108,99,255,0.15)', borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 14 },
  avatarImg:          { width: '100%', height: '100%' },
  avatarInitials:     { fontSize: 32, fontWeight: '800', color: C.text },
  avatarCameraOverlay:{ position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  avatarCameraIcon:   { fontSize: 13 },
  heroName:           { fontSize: 24, fontWeight: '800', color: C.text, marginBottom: 12, textAlign: 'center' },
  heroBadges:         { flexDirection: 'row', gap: 8 },
  badgePrimary:       { backgroundColor: 'rgba(108,99,255,0.15)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(108,99,255,0.3)' },
  badgePrimaryText:   { fontSize: 12, fontWeight: '700', color: C.primary },

  statsStrip:  { flexDirection: 'row', marginHorizontal: 16, marginBottom: 24, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  statChip:    { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statLabel:   { fontSize: 11, color: C.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  statValue:   { fontSize: 15, fontWeight: '700', color: C.text },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 12 },

  inlineInput: { fontSize: 15, color: C.text, fontWeight: '600', minWidth: 60, paddingVertical: 4, paddingHorizontal: 2, flexShrink: 1 },
  unitLabel:   { fontSize: 13, color: C.textMuted, fontWeight: '500' },

  segmented:       { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 2, gap: 2 },
  segBtn:          { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  segBtnActive:    { backgroundColor: C.primary },
  segBtnText:      { fontSize: 13, fontWeight: '600', color: C.textSec },
  segBtnTextActive:{ color: C.text },

  chevron:     { fontSize: 20, color: C.textMuted, fontWeight: '300', lineHeight: 22 },

  accountRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.rowBorder, minHeight: 56 },
  accountRowPressed:{ backgroundColor: 'rgba(255,107,107,0.06)' },
  deleteAccountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, minHeight: 56 },
  dangerIconBox:    { backgroundColor: 'rgba(255,107,107,0.1)' },
  dangerText:       { color: C.danger },

  deleteOverlay:     { flex: 1, backgroundColor: 'rgba(10,14,39,0.80)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  deleteCard:        { width: '100%', maxWidth: 320, backgroundColor: C.surface, borderRadius: 20, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  deleteCardTitle:   { marginTop: 16, fontSize: 17, fontWeight: '800', color: C.text, textAlign: 'center' },
  deleteCardBody:    { marginTop: 8, fontSize: 13, color: C.textSec, textAlign: 'center', lineHeight: 19 },
  deleteCardActions: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  deleteCardCancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, alignItems: 'center' },
  deleteCardCancelText: { color: C.textSec, fontWeight: '700', fontSize: 14 },
  deleteCardRetryBtn:   { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,107,107,0.5)', backgroundColor: 'rgba(255,107,107,0.12)', alignItems: 'center' },
  deleteCardRetryText:  { color: C.danger, fontWeight: '700', fontSize: 14 },
});
