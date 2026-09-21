import { supabase } from '../lib/supabaseClient';

const getFunctionErrorMessage = async (error: any): Promise<string> => {
  const fallback = 'Unable to delete your account. Please try again.';
  const context = error?.context;
  if (!context) return error?.message || fallback;

  try {
    const response = typeof context.clone === 'function' ? context.clone() : context;
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      return body?.error || body?.message || fallback;
    }
    const body = await response.text?.();
    return body || fallback;
  } catch {
    return fallback;
  }
};

export const deleteAccount = async (): Promise<void> => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error('Your session has expired. Sign in again before deleting your account.');
  }

  const { error } = await supabase.functions.invoke('delete-account', {
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
    },
  });
  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }
};
