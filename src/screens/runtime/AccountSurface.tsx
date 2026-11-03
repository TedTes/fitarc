import { useFlushOnLeave } from '../../hooks/useFlushOnLeave';
import { useWeightSettings } from './WeightSettings';
import { toKg, weightText } from '../../runtime/weights';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { User } from '../../types/domain';
import type { RuntimeState } from '../../runtime';
import { uploadUserAvatar } from '../../services/userProfileService';
import { colors, space, planTokens as t } from './theme';
import { Txt } from './ui';
import { PlanOptions, PlanText } from './PlanKit';
import type { SyncStatus } from './useRuntimeController';

type Props = {
  user: User;
  active?: boolean;
  state: RuntimeState;
  sync: SyncStatus;
  onSaveProfile: (profile: User) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
};

const heightText = (cm: number, unit: 'kg' | 'lb') => {
  if (unit === 'kg') return `${cm} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
};
const initialsFor = (name?:string) => (name?.trim()||'Athlete').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();

/** One body measurement as a compact tile; the label doubles as the input's accessibility name. */
const StatField = ({ label, value, onChangeText, keyboardType = 'number-pad', suffix }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'number-pad' | 'decimal-pad';
  suffix: string;
}) => (
  <View style={styles.stat}>
    <Txt variant="label" tone="muted" style={styles.statLabel}>{label.toUpperCase()}</Txt>
    <View style={styles.statRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        returnKeyType="done"
        selectTextOnFocus
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
        style={styles.statInput}
        accessibilityLabel={label}
      />
      <Txt variant="mono" tone="muted" numberOfLines={1} style={styles.statSuffix}>{suffix}</Txt>
    </View>
  </View>
);

const SEXES = [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }] as const;
const LEVELS = [{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }] as const;

export const AccountSurface = ({ user, active = true, sync, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const {unit,save:saveUnits}=useWeightSettings();
  const [profileError,setProfileError]=useState('');
  const revision=useRef(0),savedRevision=useRef(0);
  const [editVersion,setEditVersion]=useState(0);
  const saveQueue=useRef<Promise<boolean>>(Promise.resolve(true));
  const latestUser=useRef(user);latestUser.current=user;
  const saveCallback=useRef(onSaveProfile);saveCallback.current=onSaveProfile;
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Shown beside the title because there is no Save button: edits save themselves.
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(user.name ?? '');
  const [sex, setSex] = useState<User['sex']>(user.sex);
  const [experience, setExperience] = useState<User['experienceLevel']>(user.experienceLevel);
  const [age, setAge] = useState(String(user.age));
  const [height, setHeight] = useState(String(user.heightCm));
  const [weight, setWeight] = useState(user.weightKg ? weightText(user.weightKg,unit) : '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarPath, setAvatarPath] = useState(user.avatarPath);
  const initials = initialsFor(name);
  useEffect(() => {
    if(revision.current!==savedRevision.current)return;
    setName(user.name ?? '');
    setSex(user.sex);
    setExperience(user.experienceLevel);
    setAge(String(user.age));
    setHeight(String(user.heightCm));
    setWeight(user.weightKg ? weightText(user.weightKg,unit) : '');
    setAvatarUrl(user.avatarUrl);
    setAvatarPath(user.avatarPath);
  }, [user,unit]);

  const changed=<T,>(setter:(value:T)=>void)=>(value:T)=>{revision.current+=1;setEditVersion(revision.current);setProfileError('');setSaveState('idle');setter(value);};
  const persistProfile = ():Promise<boolean> => {
    if(revision.current===savedRevision.current)return Promise.resolve(true);
    const version=revision.current;
    const ageValue=Number(age),heightValue=Number(height);
    const weightValue=weight.trim()?latestUser.current.weightKg!=null&&weight===weightText(latestUser.current.weightKg,unit)?latestUser.current.weightKg:toKg(Number(weight),unit):undefined;
    const error=!name.trim()?'Enter your name.':!Number.isInteger(ageValue)||ageValue<13||ageValue>100?'Age must be between 13 and 100.':!Number.isInteger(heightValue)||heightValue<100||heightValue>250?'Height must be between 100 and 250 cm.':weightValue!==undefined&&(!Number.isFinite(weightValue)||weightValue<25||weightValue>400)?`Enter a weight between ${weightText(25,unit)} and ${weightText(400,unit)} ${unit}.`:'';
    if(error){setProfileError(error);return Promise.resolve(false);}
    const patch={name:name.trim(),sex,experienceLevel:experience,age:ageValue,heightCm:heightValue,weightKg:weightValue,avatarUrl,avatarPath};
    saveQueue.current=saveQueue.current.then(async()=>{
      if(version<=savedRevision.current)return true;
      setSaveState('saving');
      try{
        await saveCallback.current({...latestUser.current,...patch});
        savedRevision.current=version;
        if(revision.current===version){setProfileError('');setSaveState('saved');}
        return true;
      }catch(problem){setSaveState('idle');setProfileError(problem instanceof Error?problem.message:'Could not save profile. Edit a field to retry.');return false;}
    });
    return saveQueue.current;
  };
  useEffect(()=>{
    if(revision.current===savedRevision.current)return;
    const timer=setTimeout(()=>void persistProfile(),600);
    return()=>clearTimeout(timer);
  },[editVersion,name,age,height,weight,sex,experience,avatarUrl,avatarPath,unit]);
  useFlushOnLeave(persistProfile, active);
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
      changed(setAvatarPath)(uploaded.path);
      changed(setAvatarUrl)(uploaded.signedUrl);
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

  const facts = [Number(age) ? `${age} yrs` : null, Number(height) ? heightText(Number(height), unit) : null, weight ? `${weight} ${unit}` : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <PlanText kind="title">Profile</PlanText>
          {saveState !== 'idle' && !profileError ? <View style={styles.saveState} accessibilityLiveRegion="polite">
            {saveState === 'saved' ? <Ionicons name="checkmark" size={13} color={colors.success}/> : <ActivityIndicator size="small" color={colors.textMuted}/>}
            <Txt variant="mono" tone={saveState === 'saved' ? 'success' : 'muted'} style={styles.saveText}>{saveState === 'saved' ? 'saved' : 'saving'}</Txt>
          </View> : null}
        </View>

        <View style={styles.identity}>
          <Pressable accessibilityRole="button" accessibilityLabel={uploadingAvatar ? 'Uploading photo' : 'Change photo'} accessibilityState={{ disabled: uploadingAvatar }}
            disabled={uploadingAvatar} onPress={() => void chooseAvatar()} style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
            <View style={styles.avatar}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Txt variant="heading" tone="accent">{initials}</Txt>}
              {uploadingAvatar ? <View style={styles.avatarBusy}><ActivityIndicator size="small" color={colors.text}/></View> : null}
            </View>
            <View style={styles.camera}><Ionicons name="camera" size={11} color={colors.accentText}/></View>
          </Pressable>
          <View style={styles.flex}>
            <TextInput value={name} onChangeText={changed(setName)} placeholder="Your name" placeholderTextColor={colors.textMuted}
              selectionColor={colors.accent} returnKeyType="done" maxLength={60} style={styles.nameInput} accessibilityLabel="name" />
            <Txt variant="caption" tone="muted" numberOfLines={1}>{facts || 'Add your measurements below'}</Txt>
          </View>
        </View>

        <View style={styles.stats}>
          <StatField label="age" value={age} onChangeText={(value) => changed(setAge)(value.replace(/[^0-9]/g, '').slice(0, 3))} suffix="yrs" />
          <StatField label="height" value={height} onChangeText={(value) => changed(setHeight)(value.replace(/[^0-9]/g, '').slice(0, 3))} suffix="cm" />
          <StatField label="weight" value={weight} onChangeText={(value) => changed(setWeight)(value.replace(/[^0-9.]/g, '').slice(0, 6))} keyboardType="decimal-pad" suffix={unit} />
        </View>

        <View style={styles.group}>
          <Txt variant="label" tone="muted" style={styles.overline}>SEX</Txt>
          <PlanOptions segments options={SEXES} value={sex} onChange={changed(setSex)} />
        </View>
        <View style={styles.group}>
          <Txt variant="label" tone="muted" style={styles.overline}>EXPERIENCE</Txt>
          <PlanOptions segments options={LEVELS} value={experience} onChange={changed(setExperience)} />
        </View>
        {profileError?<Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">{profileError}</Txt>:null}

        <View style={styles.list}>
          <View style={styles.listRow}>
            <Ionicons name="scale-outline" size={t.icon} color={colors.textMuted}/>
            <Txt style={styles.flex}>Weight units</Txt>
            <View style={styles.unitToggle} accessibilityRole="radiogroup" accessibilityLabel="Weight units">
              {(['kg', 'lb'] as const).map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: unit === option }}
                onPress={() => { const problem = saveUnits({ weightUnit: option }); if (problem) Alert.alert('Units not changed', problem); }}
                style={({ pressed }) => [styles.unitOption, unit === option && styles.unitOn, pressed && styles.pressed]}>
                <Txt variant="caption" tone={unit === option ? 'accent' : 'muted'}>{option}</Txt>
              </Pressable>)}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={confirmSignOut} style={({pressed})=>[styles.listRow,styles.listRowLast,pressed&&styles.pressed]}>
            <Ionicons name="log-out-outline" size={t.icon} color={colors.textMuted}/>
            <Txt style={styles.flex}>Sign out</Txt>
            <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Delete account" accessibilityState={{disabled:deleting}} disabled={deleting} onPress={confirmDelete} hitSlop={8}
          style={({pressed})=>[styles.deleteLink,pressed&&styles.pressed,deleting&&styles.disabled]}>
          {deleting?<ActivityIndicator size="small" color={colors.danger}/>:null}
          <Txt variant="caption" tone="danger">{deleting?'Deleting account…':'Delete account'}</Txt>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  page: { padding: t.gutter, gap: 18, paddingBottom: 32 },
  header: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.pad.small },
  saveState: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  saveText: { fontSize: 11 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: t.pad.medium, borderRadius: t.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  avatarButton: { width: 60, height: 60 },
  avatar: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder },
  avatarImage: { width: '100%', height: '100%' },
  avatarBusy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface },
  nameInput: { color: colors.text, fontSize: 18, lineHeight: 24, minHeight: 36, paddingVertical: 4, paddingHorizontal: 0 },
  stats: { flexDirection: 'row', gap: t.pad.small },
  stat: { flex: 1, minWidth: 0, paddingTop: 10, paddingBottom: 6, paddingHorizontal: t.pad.medium, borderRadius: t.radius.row, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceInset },
  statLabel: { fontSize: 10, letterSpacing: 1 },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  statInput: { flex: 1, minWidth: 0, minHeight: 40, color: colors.text, fontSize: 20, paddingVertical: 4, paddingHorizontal: 0 },
  statSuffix: { fontSize: 11, flexShrink: 0 },
  group: { gap: t.pad.small },
  overline: { fontSize: 10, letterSpacing: 1 },
  list: { borderRadius: t.radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  listRow: { minHeight: 52, paddingHorizontal: t.pad.medium, flexDirection: 'row', alignItems: 'center', gap: t.pad.medium, borderBottomWidth: 1, borderBottomColor: colors.border },
  listRowLast: { borderBottomWidth: 0 },
  unitToggle: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: 8, backgroundColor: colors.surfaceInset },
  unitOption: { minWidth: 44, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  unitOn: { backgroundColor: colors.accentSoft },
  deleteLink: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: t.touch, paddingHorizontal: space.md },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
