begin;

-- Live settings use explicit profile columns. Reusable routines remain in versioned plans.
alter table fitarc.fitarc_profiles
  add column training_source_id uuid,
  add column training_version integer,
  add column training_goal text,
  add column training_level text,
  add column training_days_per_week integer,
  add column training_session_minutes integer,
  add column training_equipment jsonb,
  add column training_limitations jsonb,
  add column excluded_exercise_ids jsonb,
  add column seed_working_sets jsonb,
  add column training_created_at text,
  add column weight_unit text,
  add column weight_ranges jsonb,
  add column workout_schedule jsonb,
  add column next_session_additions jsonb,
  add column routine_text text,
  add column interpreted_routine_text text;
update fitarc.fitarc_profiles set
  training_source_id = (training_preferences->>'id')::uuid,
  training_version = (training_preferences->>'version')::integer,
  training_goal = (training_preferences->>'goal')::text,
  training_level = (training_preferences->>'experience')::text,
  training_days_per_week = (training_preferences->>'daysPerWeek')::integer,
  training_session_minutes = (training_preferences->>'sessionMinutes')::integer,
  training_equipment = training_preferences->'equipment',
  training_limitations = training_preferences->'limitations',
  excluded_exercise_ids = training_preferences->'excludedExerciseIds',
  seed_working_sets = training_preferences->'seedWorkingSets',
  training_created_at = (training_preferences->>'createdAt')::text,
  weight_unit = (training_preferences->>'weightUnit')::text,
  weight_ranges = training_preferences->'weightRanges',
  workout_schedule = training_preferences->'workoutSchedule',
  next_session_additions = training_preferences->'nextSessionAdditions',
  routine_text = training_preferences#>>'{routineEditor,text}',
  interpreted_routine_text = training_preferences#>>'{routineEditor,interpretedText}',
  training_split=coalesce(training_preferences#>>'{routineEditor,draft,preferredSplit}',training_preferences#>>'{routine,preferredSplit}',training_preferences#>>'{routine,split}',training_split)
where jsonb_typeof(training_preferences)='object';
update fitarc.fitarc_plans set payload=jsonb_set(payload,'{preferences}',(payload->'preferences')-'routineEditor') where jsonb_typeof(payload->'preferences')='object';
create or replace function fitarc.fitarc_save_training(p_state jsonb,p_expected_revision bigint,p_mutation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); head fitarc.fitarc_sync_heads; plan jsonb; sess jsonb; lift jsonb; st jsonb; result jsonb; adjustment jsonb;
  pos integer:=0; lpos integer; spos integer;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_mutation_id is null or p_expected_revision is null or p_expected_revision<0 then raise exception 'Invalid sync request'; end if;
  insert into fitarc.fitarc_sync_heads(user_id) values(uid) on conflict do nothing;
  select * into head from fitarc.fitarc_sync_heads where user_id=uid for update;
  if head.mutation_id=p_mutation_id then return jsonb_build_object('revision',head.revision,'conflict',false); end if;
  if head.revision<>p_expected_revision then return jsonb_build_object('revision',head.revision,'conflict',true); end if;
  if (p_state->>'schemaVersion') is distinct from '4' or jsonb_typeof(p_state->'plans') is distinct from 'array'
    or jsonb_typeof(p_state->'sessions') is distinct from 'array' then raise exception 'Invalid training format'; end if;
  if jsonb_typeof(p_state->'profile')='object' and p_state->'profile'->>'userId' is distinct from uid::text then
    raise exception 'Preferences ownership mismatch' using errcode='42501'; end if;
  insert into fitarc.fitarc_profiles(user_id,training_split,training_source_id,training_version,training_goal,training_level,training_days_per_week,training_session_minutes,training_equipment,training_limitations,excluded_exercise_ids,seed_working_sets,training_created_at,weight_unit,weight_ranges,workout_schedule,next_session_additions,routine_text,interpreted_routine_text)
  values(uid,((p_state->'profile')->>'trainingSplit')::text,((p_state->'profile')->>'id')::uuid,((p_state->'profile')->>'version')::integer,((p_state->'profile')->>'goal')::text,((p_state->'profile')->>'experience')::text,((p_state->'profile')->>'daysPerWeek')::integer,((p_state->'profile')->>'sessionMinutes')::integer,(p_state->'profile')->'equipment',(p_state->'profile')->'limitations',(p_state->'profile')->'excludedExerciseIds',(p_state->'profile')->'seedWorkingSets',((p_state->'profile')->>'createdAt')::text,((p_state->'profile')->>'weightUnit')::text,(p_state->'profile')->'weightRanges',(p_state->'profile')->'workoutSchedule',(p_state->'profile')->'nextSessionAdditions',((p_state->'profile')->>'routineText')::text,((p_state->'profile')->>'interpretedRoutineText')::text)
  on conflict(user_id) do update set training_split=excluded.training_split,training_source_id=excluded.training_source_id,training_version=excluded.training_version,training_goal=excluded.training_goal,training_level=excluded.training_level,training_days_per_week=excluded.training_days_per_week,training_session_minutes=excluded.training_session_minutes,training_equipment=excluded.training_equipment,training_limitations=excluded.training_limitations,excluded_exercise_ids=excluded.excluded_exercise_ids,seed_working_sets=excluded.seed_working_sets,training_created_at=excluded.training_created_at,weight_unit=excluded.weight_unit,weight_ranges=excluded.weight_ranges,workout_schedule=excluded.workout_schedule,next_session_additions=excluded.next_session_additions,routine_text=excluded.routine_text,interpreted_routine_text=excluded.interpreted_routine_text;
  for plan in select value from jsonb_array_elements(p_state->'plans') loop
    if plan->>'userId' is distinct from uid::text or plan->'preferences'->>'userId' is distinct from uid::text then
      raise exception 'Plan ownership mismatch' using errcode='42501'; end if;
    if exists(select 1 from fitarc.fitarc_plans where user_id=uid and id=(plan->>'id')::uuid and (payload-'currentWeek')<>(plan-'currentWeek')) then
      raise exception 'Plan versions are immutable'; end if;
    insert into fitarc.fitarc_plans values(uid,(plan->>'id')::uuid,(plan->>'groupId')::uuid,(plan->>'version')::integer,
      (plan->>'startedOn')::date,plan->>'ruleVersion',plan)
      on conflict(user_id,id) do update set payload=excluded.payload;
  end loop;
  if p_state->>'activePlanId' is not null and not exists(select 1 from fitarc.fitarc_plans where user_id=uid and id=(p_state->>'activePlanId')::uuid) then
    raise exception 'Current plan missing'; end if;
  delete from fitarc.fitarc_sessions where user_id=uid;
  for sess in select value from jsonb_array_elements(p_state->'sessions') loop
    if sess->>'blockId' is not null and not exists(select 1 from fitarc.fitarc_plans where user_id=uid and id=(sess->>'blockId')::uuid
      and group_id=(sess->>'planGroupId')::uuid and version=(sess->>'blockVersion')::integer) then raise exception 'Workout plan reference mismatch'; end if;
    if jsonb_typeof(sess->'exercises') is distinct from 'array' then raise exception 'Workout exercises missing'; end if;
    insert into fitarc.fitarc_sessions values(uid,(sess->>'id')::uuid,(sess->>'blockId')::uuid,(sess->'context'->>'date')::date,sess->>'status',pos,sess-'exercises');
    lpos:=0;
    for lift in select value from jsonb_array_elements(sess->'exercises') loop
      if jsonb_typeof(lift->'sets') is distinct from 'array' then raise exception 'Workout sets missing'; end if;
      insert into fitarc.fitarc_session_exercises values(uid,(lift->>'id')::uuid,(sess->>'id')::uuid,lift->'exercise'->>'id',lpos,lift-'sets');
      spos:=0;
      for st in select value from jsonb_array_elements(lift->'sets') loop
        result:=nullif(st->'result','null'::jsonb); adjustment:=nullif(st->'decision','null'::jsonb);
        if st->>'status'='completed' then
          if result->>'setId' is distinct from st->>'id' or result->>'prescriptionId' is distinct from sess->>'id'
            or result->>'exerciseId' is distinct from lift->'exercise'->>'id' then raise exception 'Result set reference mismatch'; end if;
          if (result->>'prescribedLoadKg')::numeric is distinct from (st->>'loadKg')::numeric
            or (result->>'prescribedMinReps')::integer is distinct from (st->>'minReps')::integer
            or (result->>'prescribedMaxReps')::integer is distinct from (st->>'maxReps')::integer
            or (result->>'targetRir')::numeric is distinct from (st->>'targetRir')::numeric then raise exception 'Result target mismatch'; end if;
          if adjustment->>'ruleVersion' is null or adjustment->>'action' not in ('increase','hold','decrease','stop')
            or adjustment->>'action' is null or adjustment->>'nextLoadKg' is null or (adjustment->>'nextLoadKg')::numeric<0
            or adjustment->>'nextMinReps' is null or (adjustment->>'nextMinReps')::integer<1
            or adjustment->>'nextMaxReps' is null or (adjustment->>'nextMaxReps')::integer<(adjustment->>'nextMinReps')::integer
            or adjustment->>'reasonCode' is null or adjustment->>'explanation' is null then raise exception 'Invalid set adjustment'; end if;
        elsif result is not null or adjustment is not null then raise exception 'Unfinished set has a result'; end if;
        insert into fitarc.fitarc_sets values(uid,(st->>'id')::uuid,(sess->>'id')::uuid,(lift->>'id')::uuid,spos,st->>'status',
          (st->>'loadKg')::numeric,(st->>'minReps')::integer,(st->>'maxReps')::integer,(st->>'targetRir')::numeric,
          (result->>'actualLoadKg')::numeric,(result->>'completedReps')::integer,(result->>'reportedRir')::numeric,
          (result->>'completedAt')::timestamptz,adjustment,st);
        spos:=spos+1;
      end loop;
      lpos:=lpos+1;
    end loop;
    pos:=pos+1;
  end loop;
  update fitarc.fitarc_sync_heads set revision=head.revision+1,mutation_id=p_mutation_id,
    metadata=jsonb_build_object('updatedAt',p_state->'updatedAt','activePlanId',p_state->'activePlanId','lastChanges',p_state->'lastChanges'),updated_at=now() where user_id=uid;
  return jsonb_build_object('revision',head.revision+1,'conflict',false);
end $$;

create or replace function fitarc.fitarc_read_training() returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); head fitarc.fitarc_sync_heads; sessions jsonb; state jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into head from fitarc.fitarc_sync_heads where user_id=uid;
  if not found or head.revision=0 then return jsonb_build_object('userId',uid,'revision',0,'mutationId',null,'state',null); end if;
  select coalesce(jsonb_agg(s.payload||jsonb_build_object('exercises',(
    select coalesce(jsonb_agg(l.payload||jsonb_build_object('sets',(
      select coalesce(jsonb_agg(st.payload order by st.position),'[]') from fitarc.fitarc_sets st where st.user_id=uid and st.session_exercise_id=l.id
    )) order by l.position),'[]') from fitarc.fitarc_session_exercises l where l.user_id=uid and l.session_id=s.id
  )) order by s.position),'[]') into sessions from fitarc.fitarc_sessions s where s.user_id=uid;
  state:=jsonb_build_object('schemaVersion',4,'updatedAt',head.metadata->'updatedAt','activePlanId',head.metadata->'activePlanId',
    'lastChanges',head.metadata->'lastChanges','sessions',sessions,
    'profile',(select case when training_source_id is null then null else jsonb_strip_nulls(jsonb_build_object('userId',user_id,'trainingSplit',training_split,'id',training_source_id,'version',training_version,'goal',training_goal,'experience',training_level,'daysPerWeek',training_days_per_week,'sessionMinutes',training_session_minutes,'equipment',training_equipment,'limitations',training_limitations,'excludedExerciseIds',excluded_exercise_ids,'seedWorkingSets',seed_working_sets,'createdAt',training_created_at,'weightUnit',weight_unit,'weightRanges',weight_ranges,'workoutSchedule',workout_schedule,'nextSessionAdditions',next_session_additions,'routineText',routine_text,'interpretedRoutineText',interpreted_routine_text)) end from fitarc.fitarc_profiles where user_id=uid),
    'plans',(select coalesce(jsonb_agg(payload order by version,id),'[]') from fitarc.fitarc_plans where user_id=uid));
  return jsonb_build_object('userId',uid,'revision',head.revision,'mutationId',head.mutation_id,'state',state);
end $$;
revoke all on function fitarc.fitarc_save_training(jsonb,bigint,uuid) from public,anon;
revoke all on function fitarc.fitarc_read_training() from public,anon;
grant execute on function fitarc.fitarc_save_training(jsonb,bigint,uuid) to authenticated;
grant execute on function fitarc.fitarc_read_training() to authenticated;


alter table fitarc.fitarc_profiles drop column training_preferences;
notify pgrst, 'reload schema';

commit;
