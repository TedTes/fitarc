import { WeightUnitOptions, useWeightSettings } from './WeightSettings';
import { toKg, weightText } from '../../runtime/weights';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { User } from '../../types/domain';
import type { RuntimeState } from '../../runtime';
import { uploadUserAvatar } from '../../services/userProfileService';
import { colors, radius, space, TOUCH, planTokens as t } from './theme';
import { Button, Choice, Sheet, Txt } from './ui';
import { equipmentLabel, goalLabel, limitationLabel } from './copy';
import { PlanPanel, PlanText } from './PlanKit';
import { useLayoutMotion } from './useLayoutMotion';
import { WorkoutResults } from './WorkoutResults';
import { FULL_GYM } from './constants';
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
    <Txt variant="mono" tone="muted" style={styles.factLabel}>{label}</Txt>
    <Txt variant="code" style={[styles.flex,styles.factValue]}>{value}</Txt>
  </View>
);

const Metric = ({label,value,unit}:{label:string;value:number|null|undefined;unit?:string}) => <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value??'Not set'}${value&&unit?` ${unit}`:''}`}>
  <View style={styles.metricValue}><Txt variant="code" style={styles.metricNumber}>{value??'—'}</Txt>{value&&unit?<Txt variant="mono" tone="muted" style={styles.metricUnit}>{unit}</Txt>:null}</View>
  <Txt variant="label" tone="muted" style={styles.metricLabel}>{label}</Txt>
</View>;
const AccountButton = ({label,icon,onPress,compact=false}:{label:string;icon:keyof typeof Ionicons.glyphMap;onPress:()=>void;compact?:boolean}) => <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[styles.outlineButton,compact&&styles.compactButton,pressed&&styles.pressed]}>
  <Ionicons name={icon} size={t.icon} color={colors.textMuted}/><Txt variant="heading" style={styles.buttonLabel}>{label}</Txt>
</Pressable>;
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

export const AccountSurface = ({ user, state, sync, onEditSource, onSaveProfile, onLogout, onDeleteAccount }: Props) => {
  const { animate } = useLayoutMotion();
  const {unit}=useWeightSettings();
  const [logOpen,setLogOpen] = useState(false);
  const [openSession,setOpenSession] = useState<string|null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
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
  const source = state.source;
  const initials = initialsFor(name);
  const completedWorkouts = useMemo(()=>state.sessions.filter(session=>session.status==='committed'&&session.exercises.some(entry=>entry.sets.some(set=>set.status==='completed'&&set.result))).slice().sort((a,b)=>(b.finishedAt??b.context.date).localeCompare(a.finishedAt??a.context.date)),[state.sessions]);
  const equipment = source?.equipment??[];
  const equipmentSummary = FULL_GYM.every(item=>equipment.includes(item))?'full gym':equipment.length?equipment.map(equipmentLabel).join(', ').toLowerCase():'bodyweight';
  const limits = [...(source?.limitations.map(limitationLabel)??[]),...(source?.routine?.limitationNote?.trim()?[source.routine.limitationNote.trim()]:[])].join(' · ')||'none';
  const trainingGoal = source?.routine?.focus?.replaceAll('_',' ')??(source?goalLabel(source.goal):'—');

  useEffect(() => {
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

  const saveProfile = async () => {
    const ageValue = Number.parseInt(age, 10);
    const heightValue = Number.parseInt(height, 10);
    const weightValue = weight.trim() ? user.weightKg!=null&&weight===weightText(user.weightKg,unit)?user.weightKg:toKg(Number(weight),unit) : undefined;
    if (!name.trim()) { Alert.alert('Name required', 'Enter the name you want shown in the app.'); return; }
    if (!Number.isFinite(ageValue) || ageValue < 13 || ageValue > 100) { Alert.alert('Check age', 'Age must be between 13 and 100.'); return; }
    if (!Number.isFinite(heightValue) || heightValue < 100 || heightValue > 250) { Alert.alert('Check height', 'Height must be between 100 and 250 cm.'); return; }
    if (weightValue !== undefined && (!Number.isFinite(weightValue) || weightValue < 25 || weightValue > 400)) { Alert.alert('Check weight', `Enter a weight between ${weightText(25,unit)} and ${weightText(400,unit)} ${unit}.`); return; }
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
        <View style={styles.header}><PlanText kind="title">Account</PlanText><AccountButton label="Workout log" icon="calendar-outline" compact onPress={()=>setLogOpen(true)}/></View>

        <View style={styles.section}>
          <PlanText kind="overline">PROFILE</PlanText>
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
                <View style={styles.badge}><Txt variant="code" tone="accent" style={styles.badgeText}>{user.experienceLevel.toUpperCase()}</Txt></View>
              </View>
            </View>
            <View style={styles.metrics}><Metric label="YEARS" value={user.age}/><Metric label="HEIGHT" value={user.heightCm} unit="cm"/><Metric label="WEIGHT" value={user.weightKg==null?undefined:Number(weightText(user.weightKg,unit))} unit={unit}/></View>
          </View>
        </View>

        <View style={styles.section}>
          <PlanText kind="overline">TRAINING</PlanText>
          <View style={styles.card}>
            <View>
              <Fact label="goal" value={trainingGoal}/>
              <Fact label="schedule" value={source?`${source.daysPerWeek} days · ${source.sessionMinutes} min`:'—'}/>
              <Fact label="equipment" value={source?equipmentSummary:'—'}/>
              <Fact label="limits" value={source?limits:'—'}/>
              <View style={styles.fact}><Txt variant="mono" tone="muted" style={styles.factLabel}>weight unit</Txt><View style={styles.flex}><WeightUnitOptions/></View></View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <PlanText kind="overline">ACCOUNT</PlanText>
          <View style={styles.accountCard}>
            <Pressable accessibilityRole="button" accessibilityLabel="Training preferences" onPress={onEditSource} style={({pressed})=>[styles.accountAction,pressed&&styles.pressed]}>
              <Ionicons name="options-outline" size={t.icon} color={colors.textMuted}/>
              <Txt variant="heading" style={[styles.flex,styles.actionLabel]}>Training preferences</Txt>
              <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/>
            </Pressable>
            <View style={styles.accountDivider}/>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={confirmSignOut} style={({pressed})=>[styles.accountAction,pressed&&styles.pressed]}>
              <Ionicons name="log-out-outline" size={t.icon} color={colors.textMuted}/>
              <Txt variant="heading" style={[styles.flex,styles.actionLabel]}>Sign out</Txt>
              <Ionicons name="chevron-forward" size={t.icon} color={colors.textDim}/>
            </Pressable>
            <View style={styles.accountDivider}/>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete account" accessibilityState={{disabled:deleting}} disabled={deleting} onPress={confirmDelete} style={({pressed})=>[styles.accountAction,pressed&&styles.pressed,deleting&&styles.disabled]}>
              {deleting?<ActivityIndicator color={colors.danger}/>:<Ionicons name="trash-outline" size={t.icon} color={colors.danger}/>}
              <Txt variant="heading" tone="danger" style={[styles.flex,styles.actionLabel]}>{deleting?'Deleting account…':'Delete account'}</Txt>
              {!deleting?<Ionicons name="chevron-forward" size={t.icon} color={colors.danger}/>:null}
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Sheet visible={logOpen} onClose={()=>setLogOpen(false)} title="Workout log">
        {completedWorkouts.length?completedWorkouts.map(session=>{
          const plan=[...(state.blockHistory??[]),...(state.block?[state.block]:[])].find(plan=>plan.id===session.blockId);
          const title=session.name??plan?.slots.find(slot=>slot.id===session.slotId)?.label??'Workout';
          const sets=session.exercises.flatMap(entry=>entry.sets).filter(set=>set.status==='completed'&&set.result).length;
          const date=new Date(`${session.context.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
          return <PlanPanel key={session.id} title={`${title} · ${date}`} summary={`${sets} ${sets===1?'set':'sets'}`} open={openSession===session.id} onToggle={()=>{animate();setOpenSession(current=>current===session.id?null:session.id);}}><WorkoutResults session={session}/></PlanPanel>;
        }):<PlanText kind="meta">No workouts yet</PlanText>}
      </Sheet>

      <Sheet visible={editingProfile} onClose={() => setEditingProfile(false)} title="Edit profile">
        <View style={styles.avatarEditor}>
          <View style={styles.avatarLarge}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Txt variant="title" tone="accent">{initials}</Txt>}
          </View>
          <Button label={uploadingAvatar ? 'Uploading…' : 'Change photo'} variant="ghost" disabled={uploadingAvatar} onPress={() => void chooseAvatar()} />
        </View>
        <Field label="name" value={name} onChangeText={setName} />
        <Field label="age" value={age} onChangeText={(value) => setAge(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix="years" />
        <Field label="height" value={height} onChangeText={(value) => setHeight(value.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" suffix="cm" />
        <Field label="weight" value={weight} onChangeText={(value) => setWeight(value.replace(/[^0-9.]/g, '').slice(0, 6))} keyboardType="decimal-pad" suffix={unit} />
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
  page: { padding:t.gutter,gap:t.bodyGap },
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:t.pad.small},
  card:{padding:t.pad.medium,gap:t.pad.medium,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.card,backgroundColor:colors.surface},
  identity:{flex:1,minWidth:0,alignItems:'flex-start'},
  editProfile:{minHeight:t.touch,maxWidth:'100%',flexDirection:'row',alignItems:'center',gap:t.pad.small},
  name:{fontSize:16,lineHeight:22,flexShrink:1},initials:{fontSize:16},
  badge:{paddingHorizontal:6,paddingVertical:2,backgroundColor:colors.accentSoft,borderWidth:t.border,borderColor:colors.accentBorder,borderRadius:6},
  badgeText:{fontSize:9,lineHeight:13},
  metrics:{flexDirection:'row',gap:t.pad.small},
  metric:{flex:1,minHeight:56,justifyContent:'center',alignItems:'center',gap:t.pad.tiny,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.segment,backgroundColor:colors.surfaceInset},
  metricValue:{flexDirection:'row',alignItems:'baseline'},metricNumber:{fontSize:17,lineHeight:22},metricUnit:{fontSize:9,lineHeight:13},metricLabel:{fontSize:8,lineHeight:12,letterSpacing:0.8},
  outlineButton:{minHeight:t.touch,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:t.pad.small,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.segment},
  compactButton:{paddingHorizontal:t.pad.medium},buttonLabel:{fontSize:12,lineHeight:17,color:colors.textSecondary},actionLabel:{fontSize:14,lineHeight:20},
  section: { gap: space.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarLarge: { width: 82, height: 82, borderRadius: 41, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarImage: { width: '100%', height: '100%' },
  avatarEditor: { alignItems: 'center', gap: space.xs },
  fact: { minHeight:34, paddingVertical:8,flexDirection:'row',gap:t.pad.medium,alignItems:'center',borderBottomWidth:t.border,borderBottomColor:colors.border },
  factValue:{fontSize:12,lineHeight:18},
  factLabel: { width:72,fontSize:10,lineHeight:16 },
  accountCard: { borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.card,backgroundColor:colors.surface,overflow:'hidden' },
  accountDivider:{height:t.border,backgroundColor:colors.border,marginHorizontal:t.pad.medium},
  accountAction: { minHeight:48,paddingHorizontal:t.pad.medium,paddingVertical:t.pad.small,flexDirection:'row',alignItems:'center',gap:t.pad.medium },
  field: { gap: space.xs },
  inputRow: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.surfaceRaised, paddingHorizontal: space.md },
  input: { flex: 1, minHeight: TOUCH, color: colors.text, fontSize: 16, paddingVertical: space.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
