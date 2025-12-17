import { supabase } from '../lib/supabaseClient';
import { User, ExperienceLevel } from '../types/domain';

const PROFILE_TABLE = process.env.EXPO_PUBLIC_PROFILE_TABLE || 'fitarc_user_profiles';

export type RemoteProfileRow = {
  user_id: string;
  gender: User['sex'] | null;
  birth_date: string | null;
  height_cm: number | null;
  training_experience: ExperienceLevel | null;
  training_split?: User['trainingSplit'] | null;
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

const mapRowToUser = (row: RemoteProfileRow): User => ({
  id: row.user_id,
  sex: row.gender ?? 'male',
  age: calculateAgeFromBirthDate(row.birth_date),
  heightCm: row.height_cm ?? 0,
  experienceLevel: row.training_experience ?? 'beginner',
  currentPhysiqueLevel: 1,
  trainingSplit: row.training_split ?? 'full_body',
  eatingMode: 'maintenance',
  createdAt: row.created_at,
});

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

  return mapRowToUser(data as RemoteProfileRow);
};

export const saveUserProfile = async (user: User): Promise<void> => {
  const { error } = await supabase
    .from(PROFILE_TABLE)
    .upsert({
      user_id: user.id,
      gender: user.sex,
      birth_date: convertAgeToBirthDate(user.age),
      height_cm: user.heightCm,
      training_experience: user.experienceLevel,
      training_split: user.trainingSplit ?? 'full_body',
      created_at: user.createdAt,
    });

  if (error) {
    throw error;
  }
};
