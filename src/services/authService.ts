import { supabase } from '../lib/supabaseClient';
import { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';

export type AuthUser = SupabaseUser;

export type SignUpCredentials = {
  email: string;
  password: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

/**
 * Sign up a new user with email and password
 */
export const signUp = async ({ email, password }: SignUpCredentials) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: 'fitarc://auth',
    },
  });

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Sign in an existing user with email and password
 */
export const signIn = async ({ email, password }: SignInCredentials) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
};

/**
 * Sign out the current user
 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
};

/**
 * Get the current authenticated user
 */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
    const message = (error as Error).message ?? '';
    if (!message.toLowerCase().includes('auth session missing')) {
      console.error('Error getting current user:', error);
    }
    return null;
  }

  return user;
};

/**
 * Get the current session
 */
export const getSession = async () => {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    const message = (error as Error).message ?? '';
    if (!message.toLowerCase().includes('auth session missing')) {
      console.error('Error getting session:', error);
    }
    return null;
  }

  return session;
};

/**
 * Listen to auth state changes
 */
export const onAuthStateChange = (
  callback: (user: AuthUser | null) => void
) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (_event: AuthChangeEvent, session: Session | null) => {
      callback(session?.user ?? null);
    }
  );

  return subscription;
};

/**
 * Send password reset email
 */
export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    throw error;
  }
};
