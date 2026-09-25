-- Destructive fresh-start cleanup: no legacy users or training data are migrated.
-- Only FitArc-owned legacy objects are listed. No CASCADE; an unexpected external dependency stops the migration.
do $$
declare routine record;
begin
  for routine in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('fitarc_commit_runtime_set','fitarc_generate_plan_days') loop
    execute format('drop function %s', routine.signature);
  end loop;
end $$;
drop table if exists
  public.fitarc_runtime_state,
  public.fitarc_runtime_decisions,
  public.fitarc_set_results,
  public.fitarc_prescribed_sets,
  public.fitarc_prescribed_exercises,
  public.fitarc_session_prescriptions,
  public.fitarc_training_slots,
  public.fitarc_block_phases,
  public.fitarc_training_blocks,
  public.fitarc_training_sources,
  public.fitarc_working_set_states,
  public.fitarc_exercise_constraints,
  public.fitarc_workout_sets,
  public.fitarc_workout_session_exercises,
  public.fitarc_workout_sessions,
  public.fitarc_plan_overrides,
  public.fitarc_plan_days,
  public.fitarc_workout_template_exercises,
  public.fitarc_workout_templates,
  public.fitarc_workout_plans,
  public.fitarc_user_exercise_defaults,
  public.fitarc_exercise_muscle_groups,
  public.fitarc_exercises,
  public.fitarc_muscle_groups,
  public.fitarc_user_profiles;
