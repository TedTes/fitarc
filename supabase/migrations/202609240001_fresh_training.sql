-- Seven-entity fresh training model in its own namespace. Shared auth and storage are preserved.
-- After deployment, add fitarc to Supabase Data API exposed schemas; preserve other projects' entries.
create schema if not exists fitarc;
revoke all on schema fitarc from public, anon;
grant usage on schema fitarc to authenticated, service_role;
alter default privileges in schema fitarc revoke execute on functions from public;
create table fitarc.fitarc_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text, gender text, birth_date date, height_cm numeric, weight_kg numeric,
  training_experience text, training_split text, eating_mode text,
  current_physique_level integer, avatar_url text, tracking_preferences jsonb,
  plan_preferences jsonb, training_preferences jsonb, created_at timestamptz not null default now()
);
create table fitarc.fitarc_exercise_catalog (
  id text primary key,
  source text not null, source_id text not null, source_url text not null, license text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and definition->>'id' = id),
  updated_at timestamptz not null default now(),
  unique(source, source_id)
);
create index fitarc_catalog_status on fitarc.fitarc_exercise_catalog(status, id);
create table fitarc.fitarc_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, group_id uuid not null, version integer not null check(version>0),
  started_on date not null, rule_version text not null, payload jsonb not null,
  primary key(user_id,id), unique(user_id,group_id,version)
);
create table fitarc.fitarc_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null, plan_id uuid, session_date date not null,
  status text not null check(status in ('proposed','active','committed')),
  position integer not null, payload jsonb not null,
  primary key(user_id,id), foreign key(user_id,plan_id) references fitarc.fitarc_plans(user_id,id)
);
create index fitarc_sessions_date on fitarc.fitarc_sessions(user_id,session_date);
create unique index fitarc_one_open_session on fitarc.fitarc_sessions(user_id) where status<>'committed';
create table fitarc.fitarc_session_exercises (
  user_id uuid not null, id uuid not null, session_id uuid not null, exercise_id text not null,
  position integer not null, payload jsonb not null,
  primary key(user_id,id), unique(user_id,session_id,id),
  foreign key(user_id,session_id) references fitarc.fitarc_sessions(user_id,id) on delete cascade
);
-- Historical definitions live in session snapshots, independently of live catalog retirement.
create table fitarc.fitarc_sets (
  user_id uuid not null, id uuid not null, session_id uuid not null, session_exercise_id uuid not null,
  position integer not null, status text not null check(status in ('pending','completed','skipped')),
  prescribed_load_kg numeric not null check(prescribed_load_kg>=0),
  min_reps integer not null check(min_reps>0), max_reps integer not null, target_rir numeric not null check(target_rir between 0 and 5),
  actual_load_kg numeric check(actual_load_kg>=0), actual_reps integer check(actual_reps>=0), actual_rir numeric check(actual_rir between 0 and 5),
  completed_at timestamptz, adjustment jsonb, payload jsonb not null,
  primary key(user_id,id),
  foreign key(user_id,session_id,session_exercise_id) references fitarc.fitarc_session_exercises(user_id,session_id,id) on delete cascade,
  check(max_reps>=min_reps),
  check((status='completed' and actual_load_kg is not null and actual_reps is not null and actual_rir is not null and completed_at is not null and adjustment is not null)
    or (status<>'completed' and actual_load_kg is null and actual_reps is null and actual_rir is null and completed_at is null and adjustment is null))
);
create index fitarc_sets_completed on fitarc.fitarc_sets(user_id,completed_at) where status='completed';
create table fitarc.fitarc_sync_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision>=0), mutation_id uuid,
  metadata jsonb not null default '{}', updated_at timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['fitarc_profiles','fitarc_plans','fitarc_sessions','fitarc_session_exercises','fitarc_sets','fitarc_sync_heads'] loop
    execute format('alter table fitarc.%I enable row level security',t);
    execute format('revoke all on fitarc.%I from public,anon,authenticated',t);
    execute format('grant select on fitarc.%I to authenticated',t);
    execute format('create policy own_read on fitarc.%I for select to authenticated using ((select auth.uid())=user_id)',t);
  end loop;
end $$;
grant insert,update on fitarc.fitarc_profiles to authenticated;
create policy own_insert on fitarc.fitarc_profiles for insert to authenticated with check((select auth.uid())=user_id);
create policy own_update on fitarc.fitarc_profiles for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
alter table fitarc.fitarc_exercise_catalog enable row level security;
revoke all on fitarc.fitarc_exercise_catalog from public,anon,authenticated;
grant select on fitarc.fitarc_exercise_catalog to authenticated;
create policy approved_catalog on fitarc.fitarc_exercise_catalog for select to authenticated using(status='approved');

create function fitarc.fitarc_save_training(p_state jsonb,p_expected_revision bigint,p_mutation_id uuid)
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
  if (p_state->>'schemaVersion') is distinct from '3' or jsonb_typeof(p_state->'plans') is distinct from 'array'
    or jsonb_typeof(p_state->'sessions') is distinct from 'array' then raise exception 'Invalid training format'; end if;
  if jsonb_typeof(p_state->'preferences')='object' and p_state->'preferences'->>'userId' is distinct from uid::text then
    raise exception 'Preferences ownership mismatch' using errcode='42501'; end if;
  insert into fitarc.fitarc_profiles(user_id,training_preferences) values(uid,p_state->'preferences')
    on conflict(user_id) do update set training_preferences=excluded.training_preferences;
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

create function fitarc.fitarc_read_training() returns jsonb language plpgsql security invoker set search_path='' as $$
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
  state:=jsonb_build_object('schemaVersion',3,'updatedAt',head.metadata->'updatedAt','activePlanId',head.metadata->'activePlanId',
    'lastChanges',head.metadata->'lastChanges','sessions',sessions,
    'preferences',(select training_preferences from fitarc.fitarc_profiles where user_id=uid),
    'plans',(select coalesce(jsonb_agg(payload order by version,id),'[]') from fitarc.fitarc_plans where user_id=uid));
  return jsonb_build_object('userId',uid,'revision',head.revision,'mutationId',head.mutation_id,'state',state);
end $$;
revoke all on function fitarc.fitarc_save_training(jsonb,bigint,uuid) from public,anon;
revoke all on function fitarc.fitarc_read_training() from public,anon;
grant execute on function fitarc.fitarc_save_training(jsonb,bigint,uuid) to authenticated;
grant execute on function fitarc.fitarc_read_training() to authenticated;

-- Trusted administrative access for catalog import; app clients retain the narrower grants above.
grant all on all tables in schema fitarc to service_role;
grant execute on function fitarc.fitarc_save_training(jsonb,bigint,uuid) to service_role;
grant execute on function fitarc.fitarc_read_training() to service_role;
