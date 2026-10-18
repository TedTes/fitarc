import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRAINING_TABLES } from '../runtime/dataModel';
import { supabase } from '../lib/supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { createProfileOutbox } from './profileOutbox';
import { createRuntimeId } from '../runtime/id';
import { withNetworkTimeout } from '../lib/networkTimeout';
import {
  User,
  ExperienceLevel,
  TrackingPreferences,
} from '../types/domain';

const PROFILE_TABLE = TRAINING_TABLES.profiles;
const profileKey = (id: string) => `fitarc:profile:v2:${id}`;

export type RemoteProfileRow = {
  user_id: string;
  name?: string | null;
  gender: User['sex'] | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  training_experience: ExperienceLevel | null;
  training_split?: User['trainingSplit'] | null;
  eating_mode?: User['eatingMode'] | null;
  current_physique_level?: number | null;
  avatar_url?: string | null;
  tracking_preferences?: TrackingPreferences | null;
  plan_preferences?: User['planPreferences'] | null;
  created_at: string;
};

const profileOutboxes = new Map<string, ReturnType<typeof createProfileOutbox<RemoteProfileRow>>>();
const profileOutbox = (userId: string) => {
  const existing = profileOutboxes.get(userId);
  if (existing) return existing;
  const key = `${profileKey(userId)}:pending`;
  const outbox = createProfileOutbox<RemoteProfileRow>({
    createId: createRuntimeId,
    read: async () => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const pending = JSON.parse(raw) as { id: string; value: RemoteProfileRow };
      if (pending.value?.user_id !== userId || !pending.id) throw Error('Invalid saved profile edit.');
      return pending;
    },
    write: value => AsyncStorage.setItem(key, JSON.stringify(value)),
    clear: () => AsyncStorage.removeItem(key),
    cache: value => AsyncStorage.setItem(profileKey(userId), JSON.stringify(value)),
    upload: async value => {
      const { error } = await withNetworkTimeout(signal => supabase.from(PROFILE_TABLE).upsert(value).abortSignal(signal));
      if (error) throw error;
    },
  });
  profileOutboxes.set(userId, outbox);
  return outbox;
};

export const flushPendingUserProfile = (userId: string) => profileOutbox(userId).flush();

const calculateAgeFromBirthDate = (birthDate?: string | null) => {
  if (!birthDate) return 0;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasNotHadBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (hasNotHadBirthday) {
    age -= 1;
  }
  return Math.max(age, 0);
};

const convertAgeToBirthDate = (age: number) => {
  const today = new Date();
  const birthYear = today.getFullYear() - age;
  const birthDate = new Date(birthYear, 0, 1);
  return birthDate.toISOString().split('T')[0];
};

const mapRowToUser = (row: RemoteProfileRow): User => {
  const storedAvatar = row.avatar_url ?? undefined;
  const isUrl = typeof storedAvatar === 'string' && storedAvatar.startsWith('http');
  return {
    id: row.user_id,
    name: row.name ?? undefined,
    sex: row.gender ?? 'male',
    age: calculateAgeFromBirthDate(row.birth_date),
    heightCm: row.height_cm ?? 0,
    weightKg: row.weight_kg ?? undefined,
    experienceLevel: row.training_experience ?? 'beginner',
    currentPhysiqueLevel: row.current_physique_level ?? 1,
    trainingSplit: row.training_split ?? 'full_body',
    eatingMode: row.eating_mode ?? 'maintenance',
    avatarUrl: isUrl ? storedAvatar : undefined,
    avatarPath: isUrl ? undefined : storedAvatar,
    trackingPreferences: row.tracking_preferences ?? undefined,
    planPreferences: row.plan_preferences ?? undefined,
    createdAt: row.created_at,
  };
};

export const getSignedAvatarUrl = async (path: string): Promise<string | undefined> => {
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn('Failed to create signed avatar URL', error);
    return undefined;
  }
  return data?.signedUrl;
};

export const fetchUserProfile = async (userId: string): Promise<User | null> => {
  const outbox = profileOutbox(userId);
  await outbox.flush().catch(() => undefined);
  const pending = await outbox.pending();
  if (pending) return mapRowToUser(pending.value);
  const { data, error } = await withNetworkTimeout(signal => supabase
    .from(PROFILE_TABLE)
    .select('*')
    .eq('user_id', userId)
    .abortSignal(signal).maybeSingle());

  // Edits made while this read was in flight take precedence over its old row.
  const newer = await outbox.pending();
  if (newer) return mapRowToUser(newer.value);

  if (error) {
    const cached = await AsyncStorage.getItem(profileKey(userId));
    if (cached) return mapRowToUser(JSON.parse(cached) as RemoteProfileRow);
    throw error;
  }

  if (!data) {
    await AsyncStorage.removeItem(profileKey(userId));
    return null;
  }
  await AsyncStorage.setItem(profileKey(userId), JSON.stringify(data));
  
  const user = mapRowToUser(data as RemoteProfileRow);
  if (user.avatarPath) {
    user.avatarUrl = await getSignedAvatarUrl(user.avatarPath);
  }
  return user;
};

export const saveUserProfile = async (user: User): Promise<void> => {
  const payload: RemoteProfileRow = {
    user_id: user.id,
    plan_preferences: user.planPreferences ?? null,
    name: user.name ?? null,
    gender: user.sex,
    birth_date: convertAgeToBirthDate(user.age),
    height_cm: user.heightCm,
    weight_kg: user.weightKg ?? null,
    training_experience: user.experienceLevel,
    eating_mode: user.eatingMode ?? 'maintenance',
    current_physique_level: user.currentPhysiqueLevel ?? 1,
    avatar_url: user.avatarPath ?? user.avatarUrl ?? null,
    created_at: user.createdAt,
  };

  if (user.trackingPreferences !== undefined) {
    payload.tracking_preferences = user.trackingPreferences ?? null;
  }

  const outbox = profileOutbox(user.id);
  await outbox.stage(payload);
  await outbox.flush();
};

export const updateTrackingPreferences = async (
  userId: string,
  preferences: TrackingPreferences
): Promise<void> => {
  const { error } = await supabase
    .from(PROFILE_TABLE)
    .update({ tracking_preferences: preferences })
    .eq('user_id', userId);
  if (error) {
    throw error;
  }
};

export const uploadUserAvatar = async (
  userId: string,
  uri: string
): Promise<{ path: string; signedUrl?: string }> => {
  const fileExt = uri.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || !info.size) {
    throw new Error('Avatar file is empty or missing.');
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = Buffer.from(base64, 'base64');
  const normalizedExt = fileExt.toLowerCase();
  const contentType = normalizedExt === 'jpg' ? 'image/jpeg' : `image/${normalizedExt}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, bytes, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const signedUrl = await getSignedAvatarUrl(filePath);
  if (!signedUrl) {
    throw new Error('Unable to generate avatar URL. Check storage policies.');
  }
  return { path: filePath, signedUrl };
};
