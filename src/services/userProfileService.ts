import { supabase } from '../lib/supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import { User, ExperienceLevel, TrackingPreferences } from '../types/domain';

const PROFILE_TABLE = process.env.EXPO_PUBLIC_PROFILE_TABLE || 'fitarc_user_profiles';

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
  created_at: string;
};

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
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }
  
  const user = mapRowToUser(data as RemoteProfileRow);
  if (user.avatarPath) {
    user.avatarUrl = await getSignedAvatarUrl(user.avatarPath);
  }
  return user;
};

export const saveUserProfile = async (user: User): Promise<void> => {
  const payload: RemoteProfileRow = {
    user_id: user.id,
    name: user.name ?? null,
    gender: user.sex,
    birth_date: convertAgeToBirthDate(user.age),
    height_cm: user.heightCm,
    weight_kg: user.weightKg ?? null,
    training_experience: user.experienceLevel,
    training_split: user.trainingSplit ?? 'full_body',
    eating_mode: user.eatingMode ?? 'maintenance',
    current_physique_level: user.currentPhysiqueLevel ?? 1,
    avatar_url: user.avatarPath ?? user.avatarUrl ?? null,
    created_at: user.createdAt,
  };

  if (user.trackingPreferences !== undefined) {
    payload.tracking_preferences = user.trackingPreferences ?? null;
  }

  const { error } = await supabase.from(PROFILE_TABLE).upsert(payload);

  if (error) {
    throw error;
  }
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
