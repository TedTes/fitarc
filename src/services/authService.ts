import { supabase } from '../lib/supabaseClient';
import { AuthChangeEvent, Session, User as SupabaseUser } from '@supabase/supabase-js';
import * as ExpoLinking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

export type AuthUser = SupabaseUser;

export type SignUpCredentials = {
  email: string;
  password: string;
};

export type SignInCredentials = {
  email: string;
  password: string;
};

export type SocialAuthProvider = 'google' | 'apple';

const AUTH_CALLBACK_URL = ExpoLinking.createURL('auth');
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim();

export const isAuthUserVerified = (user: AuthUser | null | undefined): boolean => {
  if (!user) return false;
  const provider = String(user.app_metadata?.provider ?? 'email');
  if (provider !== 'email') return true;
  return Boolean(user.email_confirmed_at || user.confirmed_at);
};

const createAuthError = (message: string, code: string) => {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
};

export const completeAuthRedirect = async (url: string): Promise<void> => {
  const parsed = ExpoLinking.parse(url);
  const queryParams = parsed.queryParams ?? {};
  const code = typeof queryParams.code === 'string' ? queryParams.code : undefined;
  const accessToken = typeof queryParams.access_token === 'string'
    ? queryParams.access_token
    : undefined;
  const refreshToken = typeof queryParams.refresh_token === 'string'
    ? queryParams.refresh_token
    : undefined;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw error;
    }
    return;
  }

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  const authError = queryParams.error_description ?? queryParams.error;
  if (typeof authError === 'string') {
    throw new Error(authError);
  }
};

/**
 * Sign up a new user with email and password
 */
export const signUp = async ({ email, password }: SignUpCredentials) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: AUTH_CALLBACK_URL,
    },
  });

  if (error) {
    throw error;
  }

  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw createAuthError('User already registered', 'user_already_exists');
  }

  // Registration never enters the product directly. Email users must return
  // through the confirmation link, even if a project setting yields a session.
  if (data.session) {
    await supabase.auth.signOut({ scope: 'local' });
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

  if (!isAuthUserVerified(data.user)) {
    await supabase.auth.signOut({ scope: 'local' });
    throw createAuthError(
      'Confirm your email before signing in.',
      'email_not_verified'
    );
  }

  return data;
};

export const signInWithSocialProvider = async (
  provider: SocialAuthProvider
): Promise<void> => {
  if (provider === 'apple') {
    if (Platform.OS !== 'ios' || !(await AppleAuthentication.isAvailableAsync())) {
      throw createAuthError('Apple sign-in is unavailable on this device.', 'oauth_unsupported');
    }

    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
        state: Crypto.randomUUID(),
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });
      if (error) throw error;
      return;
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') {
        throw createAuthError('Sign-in was cancelled.', 'oauth_cancelled');
      }
      throw error;
    }
  }

  const platformClientConfigured = Platform.OS === 'ios'
    ? Boolean(GOOGLE_IOS_CLIENT_ID)
    : Platform.OS === 'android'
      ? Boolean(GOOGLE_ANDROID_CLIENT_ID)
      : false;

  if (!GOOGLE_WEB_CLIENT_ID || !platformClientConfigured) {
    throw createAuthError(
      'Fitarc Google sign-in still needs its own Google client IDs.',
      'oauth_not_configured'
    );
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios' ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    offlineAccess: false,
    scopes: ['email', 'profile'],
  });

  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    throw createAuthError('Sign-in was cancelled.', 'oauth_cancelled');
  }

  const tokens = await GoogleSignin.getTokens();
  const idToken = response.data.idToken ?? tokens.idToken;
  if (!idToken) throw new Error('Google did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
    access_token: tokens.accessToken,
  });
  if (error) throw error;
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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_CALLBACK_URL,
  });

  if (error) {
    throw error;
  }
};

export const resendVerificationEmail = async (email: string) => {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: AUTH_CALLBACK_URL,
    },
  });

  if (error) throw error;
};
