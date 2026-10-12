import { SavedRoutines } from './SavedRoutines';
import { useWeightSettings } from './WeightSettings';
import { toKg, weightText } from '../../runtime/weights';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { User } from '../../types/domain';
import type { RuntimeState } from '../../runtime';
import { uploadUserAvatar } from '../../services/userProfileService';
import { colors, radius, space, TOUCH, planTokens as t } from './theme';
import { Button, Choice, Sheet, Txt } from './ui';
import { PlanText } from './PlanKit';
import type { SyncStatus } from './useRuntimeController';

type Props = {
  user: User;
  active?: boolean;
  state: RuntimeState;
  sync: SyncStatus;
  routineControls: ReactNode;
  onUseRoutine:(id:string)=>string|undefined;
  onSaveProfile: (profile: User) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
  onDeleteAccount: () => void | Promise<void>;
};

const heightText = (cm: number, unit: 'kg' | 'lb') => {
  if (unit === 'kg') return `${cm} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)}′${inches % 12}″`;
};
const Stat = ({ value, label }: { value: string; label: string }) => <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
  <Txt variant="code" style={styles.statValue} numberOfLines={1}>{value}</Txt>
  <Txt variant="caption" tone="muted" numberOfLines={1}>{label}</Txt>
</View>;
const initialsFor = (name?:string) => (name?.trim()||'Athlete').split(/\s+/).map(part=>part[0]).join('').slice(0,2).toUpperCase();

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

export const AccountSurface = ({ user, active = true, state, sync, routineControls, onUseRoutine, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const {unit,save:saveUnits}=useWeightSettings();
  const [routinesOpen, setRoutinesOpen] = useState(false);
  useEffect(() => {
    if (!routinesOpen || !active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setRoutinesOpen(false); return true; });
    return () => subscription.remove();
  }, [routinesOpen, active]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileError,setProfileError]=useState('');
  const revision=useRef(0),savedRevision=useRef(0);
  const [editVersion,setEditVersion]=useState(0);
  const saveQueue=useRef<Promise<boolean>>(Promise.resolve(true));
  const latestUser=useRef(user);latestUser.current=user;
  const saveCallback=useRef(onSaveProfile);saveCallback.current=onSaveProfile;
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
  const summary = (() => {
    const done = state.sessions.filter(session => session.status === 'committed'
      && session.exercises.some(entry => entry.sets.some(set => set.status === 'completed' && (set.result?.completedReps ?? 0) > 0)));
    const ids = new Set(done.map(session => session.id));
    const results = state.setResults.filter(result => ids.has(result.prescriptionId) && result.completedReps > 0);
    const volume = results.reduce((sum, result) => sum + (result.actualLoadKg ?? result.prescribedLoadKg) * result.completedReps, 0);
    // Weeks in a row (ending this week or last) with at least one finished workout.
    const weekOf = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / (7 * 86400000));
    const weeks = new Set(done.map(session => weekOf(session.context.date)));
    let week = weekOf(new Date().toISOString().slice(0, 10)), streak = 0;
    if (!weeks.has(week)) week -= 1;
    while (weeks.has(week)) { streak += 1; week -= 1; }
    const best = results.reduce<typeof results[number] | null>((top, result) =>
      (result.actualLoadKg ?? result.prescribedLoadKg) > (top ? top.actualLoadKg ?? top.prescribedLoadKg : 0) ? result : top, null);
    const catalog = [...(state.block?.catalog ?? []), ...(state.catalog ?? [])];
    const bestName = best ? catalog.find(item => item.id === best.exerciseId)?.name : undefined;
    return { workouts: done.length, volume, streak, best: best && bestName ? { name: bestName, kg: best.actualLoadKg ?? best.prescribedLoadKg } : null };
  })();

  useEffect(() => {
    if(editingProfile || revision.current!==savedRevision.current)return;
    setName(user.name ?? '');
    setSex(user.sex);
    setExperience(user.experienceLevel);
    setAge(String(user.age));
    setHeight(String(user.heightCm));
    setWeight(user.weightKg ? weightText(user.weightKg,unit) : '');
    setAvatarUrl(user.avatarUrl);
    setAvatarPath(user.avatarPath);
  }, [user,unit]);

  const openProfileEditor = () => {
    if(revision.current!==savedRevision.current){setEditingProfile(true);return;}
    setProfileError('');
    setName(user.name ?? '');
    setSex(user.sex);
    setExperience(user.experienceLevel);
    setAge(String(user.age));
    setHeight(String(user.heightCm));
    setWeight(user.weightKg ? weightText(user.weightKg,unit) : '');
    setAvatarUrl(user.avatarUrl);
    setAvatarPath(user.avatarPath);
    setEditingProfile(true);
  };

  const changed=<T,>(setter:(value:T)=>void)=>(value:T)=>{revision.current+=1;setEditVersion(revision.current);setProfileError('');setter(value);};
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
      try{
        await saveCallback.current({...latestUser.current,...patch});
        savedRevision.current=version;
        if(revision.current===version){setProfileError('');}
        return true;
      }catch(problem){setProfileError(problem instanceof Error?problem.message:'Could not save profile. Edit a field or close to retry.');return false;}
    });
    return saveQueue.current;
  };
  useEffect(()=>{
    if(revision.current===savedRevision.current)return;
    const timer=setTimeout(()=>void persistProfile(),600);
    return()=>clearTimeout(timer);
  },[editVersion,name,age,height,weight,sex,experience,avatarUrl,avatarPath,unit]);
  const closeProfileEditor=async()=>{
    if(uploadingAvatar)return;
    const version=revision.current;
    if(await persistProfile()&&version===revision.current)setEditingProfile(false);
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

  return (
    <View style={styles.root}>
      <ScrollView style={routinesOpen ? styles.hidden : undefined} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><PlanText kind="title">Profile</PlanText></View>

        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              {user.avatarUrl ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} /> : <Txt variant="heading" tone="accent" style={styles.initials}>{initialsFor(user.name)}</Txt>}
            </View>
            <View style={styles.identity}>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit profile" onPress={openProfileEditor} style={({pressed})=>[styles.editProfile,pressed&&styles.pressed]}>
                <Txt variant="heading" style={styles.name}>{user.name?.trim() || 'Athlete'}</Txt>
                <Ionicons name="pencil-outline" size={15} color={colors.textMuted}/>
              </Pressable>
              <Txt variant="caption" tone="secondary" numberOfLines={1}>
                {[`${user.age} yrs`, heightText(user.heightCm, unit), user.weightKg != null ? `${weightText(user.weightKg, unit)} ${unit}` : null].filter(Boolean).join(' · ')}
                <Txt variant="caption" tone="accent">{'  ·  '}{user.experienceLevel}</Txt>
              </Txt>
            </View>
          </View>
          {summary.workouts ? <View style={styles.stats}>
            <Stat value={String(summary.workouts)} label={summary.workouts === 1 ? 'workout' : 'workouts'}/>
            <Stat value={summary.streak ? String(summary.streak) : '—'} label={summary.streak === 1 ? 'week streak' : 'weeks streak'}/>
            <Stat value={`${Math.round(summary.volume / (unit === 'lb' ? 0.45359237 : 1)).toLocaleString()}`} label={`${unit} lifted`}/>
          </View> : null}
          {summary.best ? <Txt variant="caption" tone="secondary" numberOfLines={1}>Heaviest lift: <Txt variant="caption">{summary.best.name} · {weightText(summary.best.kg, unit)} {unit}</Txt></Txt> : null}
        </View>

        <View style={styles.section}>
          <PlanText kind="overline">TRAINING</PlanText>
          {routineControls}
          <View style={styles.accountCard}>
            <Pressable accessibilityRole="button" accessibilityLabel="Routines" onPress={() => setRoutinesOpen(true)}
              style={({pressed}) => [styles.accountAction, pressed && styles.pressed]}>
              <Ionicons name="barbell-outline" size={t.icon} color={colors.textMuted}/>
              <Txt variant="heading" style={[styles.flex, styles.actionLabel]}>Routines</Txt>
              <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View style={[styles.fact, styles.factLast]}>
              <Txt variant="caption" tone="muted" style={styles.factLabel}>Units</Txt>
              <View style={styles.flex}/>
              <View style={styles.unitToggle} accessibilityRole="radiogroup" accessibilityLabel="Weight units">
                {(['kg', 'lb'] as const).map(option => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: unit === option }}
                  onPress={() => { const problem = saveUnits({ weightUnit: option }); if (problem) Alert.alert('Units not changed', problem); }}
                  style={({ pressed }) => [styles.unitOption, unit === option && styles.unitOn, pressed && styles.pressed]}>
                  <Txt variant="caption" tone={unit === option ? 'accent' : 'muted'}>{option}</Txt>
                </Pressable>)}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.accountCard}>
          <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={confirmSignOut} style={({pressed})=>[styles.accountAction,pressed&&styles.pressed]}>
            <Ionicons name="log-out-outline" size={t.icon} color={colors.textMuted}/>
            <Txt variant="heading" style={[styles.flex,styles.actionLabel]}>Sign out</Txt>
            <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Delete account" accessibilityState={{disabled:deleting}} disabled={deleting} onPress={confirmDelete} hitSlop={8}
          style={({pressed})=>[styles.deleteLink,pressed&&styles.pressed,deleting&&styles.disabled]}>
          {deleting?<ActivityIndicator size="small" color={colors.danger}/>:null}
          <Txt variant="caption" tone="danger">{deleting?'Deleting account…':'Delete account'}</Txt>
        </Pressable>
      </ScrollView>
      {routinesOpen ? <SavedRoutines state={state} onUseRoutine={onUseRoutine} onBack={() => setRoutinesOpen(false)}/> : null}

      <Sheet visible={editingProfile} onClose={() => void closeProfileEditor()} title="Edit profile">
        <View style={styles.avatarEditor}>
          <View style={styles.avatarLarge}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Txt variant="title" tone="accent">{initials}</Txt>}
          </View>
          <Button label={uploadingAvatar ? 'Uploading…' : 'Change photo'} variant="ghost" disabled={uploadingAvatar} onPress={() => void chooseAvatar()} />
        </View>
        <Field label="name" value={name} onChangeText={changed(setName)} />
        <Field label="age" value={age} onChangeText={(value) => changed(setAge)(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix="years" />
        <Field label="height" value={height} onChangeText={(value) => changed(setHeight)(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix={unit === 'lb' && Number(height) >= 100 ? `cm · ${heightText(Number(height), 'lb')}` : 'cm'} />
        <Field label="weight" value={weight} onChangeText={(value) => changed(setWeight)(value.replace(/[^0-9.]/g, '').slice(0, 6))} keyboardType="decimal-pad" suffix={unit} />
        <Txt variant="label" tone="muted">SEX</Txt>
        <View style={styles.choices}>
          {(['male', 'female', 'other'] as const).map((value) => <Choice key={value} compact code label={value} selected={sex === value} onPress={() => changed(setSex)(value)} />)}
        </View>
        <Txt variant="label" tone="muted">EXPERIENCE</Txt>
        <View style={styles.choices}>
          {(['beginner', 'intermediate', 'advanced'] as const).map((value) => <Choice key={value} compact code label={value} selected={experience === value} onPress={() => changed(setExperience)(value)} />)}
        </View>
        {profileError?<Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">{profileError}</Txt>:null}
      </Sheet>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  hidden: { display: 'none' },
  flex: { flex: 1 },
  page: { padding:t.gutter,gap:t.bodyGap },
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:t.pad.small},
  card:{padding:t.pad.medium,gap:t.pad.medium,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.card,backgroundColor:colors.surface},
  identity:{flex:1,minWidth:0,alignItems:'flex-start',gap:2},
  editProfile:{minHeight:t.touch,maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:t.pad.small},
  name:{fontSize:16,lineHeight:22,flexShrink:1},initials:{fontSize:16},
  stats:{flexDirection:'row',gap:t.pad.small},
  stat:{flex:1,paddingVertical:t.pad.small,paddingHorizontal:t.pad.small,gap:2,borderRadius:t.radius.segment,backgroundColor:colors.surfaceInset},
  statValue:{fontSize:17,lineHeight:22},
  trainingHead:{flexDirection:'row',alignItems:'center',gap:4,paddingBottom:4},
  factLast:{borderBottomWidth:0,marginTop:-t.pad.medium},
  deleteLink:{alignSelf:'center',flexDirection:'row',alignItems:'center',gap:space.sm,minHeight:t.touch,paddingHorizontal:space.md},
  actionLabel:{fontSize:14,lineHeight:20},
  section: { gap: space.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 56, height: 56, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarLarge: { width: 82, height: 82, borderRadius: 41, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarImage: { width: '100%', height: '100%' },
  avatarEditor: { alignItems: 'center', gap: space.xs },
  fact: { minHeight:34, paddingVertical:8,flexDirection:'row',gap:t.pad.medium,alignItems:'center',borderBottomWidth:t.border,borderBottomColor:colors.border },
  unitToggle:{flexDirection:'row',padding:2,gap:2,borderRadius:8,backgroundColor:colors.surfaceInset},
  unitOption:{minWidth:44,height:28,alignItems:'center',justifyContent:'center',borderRadius:6},
  unitOn:{backgroundColor:colors.accentSoft},
  factLabel: { width:84 },
  accountCard: { borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.card,backgroundColor:colors.surface,overflow:'hidden' },
  accountAction: { minHeight:48,paddingHorizontal:t.pad.medium,paddingVertical:t.pad.small,flexDirection:'row',alignItems:'center',gap:t.pad.medium },
  field: { gap: space.xs },
  inputRow: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: TOUCH, color: colors.text, fontSize: 16, paddingVertical: space.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
