// @ts-nocheck -- Deno's runtime is separate from Expo's TypeScript build.
import { createRoutineInputHandler } from '../_shared/routineInput.ts';
Deno.serve(createRoutineInputHandler({
  SUPABASE_URL:Deno.env.get('SUPABASE_URL'),SUPABASE_ANON_KEY:Deno.env.get('SUPABASE_ANON_KEY'),
  OPENAI_API_KEY:Deno.env.get('OPENAI_API_KEY'),OPENAI_ROUTINE_MODEL:Deno.env.get('OPENAI_ROUTINE_MODEL'),
  OPENAI_TRANSCRIBE_MODEL:Deno.env.get('OPENAI_TRANSCRIBE_MODEL'),
}));
