import { supabase } from '../lib/supabaseClient';

export const deleteAccount = async (): Promise<void> => {
  const { error } = await supabase.functions.invoke('delete-account');
  if (error) {
    console.log(`error from delete edge function : ${error}`)
    throw error;
  }
};
