create extension if not exists pgcrypto;

create table if not exists public.fitarc_training_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  goal text not null check (goal in ('hypertrophy', 'strength')),
  experience text not null check (experience in ('intermediate', 'advanced')),
  days_per_week integer not null check (days_per_week between 3 and 5),
  session_minutes integer not null check (session_minutes in (30, 45, 60, 75)),
  equipment jsonb not null default '[]'::jsonb,
  excluded_exercise_ids jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  seed_working_sets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists public.fitarc_training_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.fitarc_training_sources(id),
  version integer not null check (version > 0),
  rule_version text not null,
  goal text not null check (goal in ('hypertrophy', 'strength')),
  started_on date not null,
  duration_weeks integer not null check (duration_weeks between 4 and 8),
  current_week integer not null default 1,
  status text not null default 'active' check (status in ('active', 'superseded', 'completed')),
  weekly_targets jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists public.fitarc_block_phases (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.fitarc_training_blocks(id) on delete cascade,
  kind text not null check (kind in ('accumulate', 'intensify', 'peak', 'deload')),
  start_week integer not null,
  end_week integer not null,
  volume_multiplier numeric not null,
  target_rir integer not null check (target_rir between 0 and 5),
  min_reps integer not null,
  max_reps integer not null,
  intensity_cap numeric not null,
  check (start_week <= end_week and min_reps <= max_reps)
);

create table if not exists public.fitarc_training_slots (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.fitarc_training_blocks(id) on delete cascade,
  day_index integer not null,
  label text not null,
  target_muscles jsonb not null,
  movement_patterns jsonb not null,
  set_budget integer not null check (set_budget > 0),
  unique (block_id, day_index)
);

create table if not exists public.fitarc_session_prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  block_id uuid not null references public.fitarc_training_blocks(id),
  block_version integer not null,
  slot_id uuid not null references public.fitarc_training_slots(id),
  session_date date not null,
  minutes_available integer not null,
  recovery text not null check (recovery in ('yes', 'meh', 'no')),
  phase text not null check (phase in ('accumulate', 'intensify', 'peak', 'deload')),
  estimated_minutes integer not null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'committed')),
  explanation text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fitarc_prescribed_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.fitarc_session_prescriptions(id) on delete cascade,
  exercise_id uuid references public.fitarc_exercises(id),
  exercise_key text not null,
  exercise_name text not null,
  priority integer not null,
  reason text not null,
  exercise_snapshot jsonb not null,
  unique (session_id, priority)
);

create table if not exists public.fitarc_prescribed_sets (
  id uuid primary key default gen_random_uuid(),
  prescribed_exercise_id uuid not null references public.fitarc_prescribed_exercises(id) on delete cascade,
  set_number integer not null,
  load_kg numeric not null check (load_kg >= 0),
  min_reps integer not null check (min_reps > 0),
  max_reps integer not null check (max_reps >= min_reps),
  target_rir integer not null check (target_rir between 0 and 5),
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  unique (prescribed_exercise_id, set_number)
);

create table if not exists public.fitarc_set_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prescribed_set_id uuid not null unique references public.fitarc_prescribed_sets(id),
  completed_reps integer not null check (completed_reps >= 0),
  reported_rir integer not null check (reported_rir between 0 and 5),
  completed_at timestamptz not null default now()
);

create table if not exists public.fitarc_runtime_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.fitarc_session_prescriptions(id),
  prescribed_set_id uuid references public.fitarc_prescribed_sets(id),
  action text not null check (action in ('increase', 'hold', 'decrease', 'stop')),
  next_load_kg numeric not null,
  next_min_reps integer not null,
  next_max_reps integer not null,
  reason_code text not null,
  explanation text not null,
  rule_version text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.fitarc_working_set_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_key text not null,
  load_kg numeric not null,
  reps integer not null,
  rir integer not null check (rir between 0 and 5),
  rir_confidence numeric not null check (rir_confidence between 0 and 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_key)
);

create table if not exists public.fitarc_exercise_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_key text,
  limitation text,
  kind text not null check (kind in ('excluded', 'painful', 'unavailable')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (exercise_key is not null or limitation is not null)
);

create table if not exists public.fitarc_runtime_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists fitarc_runtime_sessions_user_date_idx on public.fitarc_session_prescriptions(user_id, session_date desc);
create index if not exists fitarc_runtime_results_user_completed_idx on public.fitarc_set_results(user_id, completed_at desc);
create index if not exists fitarc_runtime_decisions_session_idx on public.fitarc_runtime_decisions(session_id, created_at);

alter table public.fitarc_training_sources enable row level security;
alter table public.fitarc_training_blocks enable row level security;
alter table public.fitarc_block_phases enable row level security;
alter table public.fitarc_training_slots enable row level security;
alter table public.fitarc_session_prescriptions enable row level security;
alter table public.fitarc_prescribed_exercises enable row level security;
alter table public.fitarc_prescribed_sets enable row level security;
alter table public.fitarc_set_results enable row level security;
alter table public.fitarc_runtime_decisions enable row level security;
alter table public.fitarc_working_set_states enable row level security;
alter table public.fitarc_exercise_constraints enable row level security;
alter table public.fitarc_runtime_state enable row level security;

create policy "runtime source owner" on public.fitarc_training_sources for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime block owner" on public.fitarc_training_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime phase owner" on public.fitarc_block_phases for all using (exists (select 1 from public.fitarc_training_blocks b where b.id = block_id and b.user_id = auth.uid())) with check (exists (select 1 from public.fitarc_training_blocks b where b.id = block_id and b.user_id = auth.uid()));
create policy "runtime slot owner" on public.fitarc_training_slots for all using (exists (select 1 from public.fitarc_training_blocks b where b.id = block_id and b.user_id = auth.uid())) with check (exists (select 1 from public.fitarc_training_blocks b where b.id = block_id and b.user_id = auth.uid()));
create policy "runtime session owner" on public.fitarc_session_prescriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime exercise owner" on public.fitarc_prescribed_exercises for all using (exists (select 1 from public.fitarc_session_prescriptions s where s.id = session_id and s.user_id = auth.uid())) with check (exists (select 1 from public.fitarc_session_prescriptions s where s.id = session_id and s.user_id = auth.uid()));
create policy "runtime prescribed set owner" on public.fitarc_prescribed_sets for all using (exists (select 1 from public.fitarc_prescribed_exercises e join public.fitarc_session_prescriptions s on s.id = e.session_id where e.id = prescribed_exercise_id and s.user_id = auth.uid())) with check (exists (select 1 from public.fitarc_prescribed_exercises e join public.fitarc_session_prescriptions s on s.id = e.session_id where e.id = prescribed_exercise_id and s.user_id = auth.uid()));
create policy "runtime result owner" on public.fitarc_set_results for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime decision owner" on public.fitarc_runtime_decisions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime working state owner" on public.fitarc_working_set_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime constraint owner" on public.fitarc_exercise_constraints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runtime state owner" on public.fitarc_runtime_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.fitarc_commit_runtime_set(
  p_set_id uuid,
  p_completed_reps integer,
  p_reported_rir integer,
  p_decision jsonb,
  p_exercise_key text,
  p_rir_confidence numeric
) returns uuid language plpgsql security invoker as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_result_id uuid;
begin
  select s.id into v_session_id
  from public.fitarc_prescribed_sets ps
  join public.fitarc_prescribed_exercises pe on pe.id = ps.prescribed_exercise_id
  join public.fitarc_session_prescriptions s on s.id = pe.session_id
  where ps.id = p_set_id and s.user_id = v_user_id and ps.status = 'pending'
  for update of ps;
  if v_session_id is null then raise exception 'set_not_pending_or_not_owned'; end if;

  insert into public.fitarc_set_results(user_id, prescribed_set_id, completed_reps, reported_rir)
  values (v_user_id, p_set_id, p_completed_reps, p_reported_rir)
  returning id into v_result_id;
  update public.fitarc_prescribed_sets set status = 'completed' where id = p_set_id;
  insert into public.fitarc_runtime_decisions(user_id, session_id, prescribed_set_id, action, next_load_kg, next_min_reps, next_max_reps, reason_code, explanation, rule_version)
  values (v_user_id, v_session_id, p_set_id, p_decision->>'action', (p_decision->>'nextLoadKg')::numeric, (p_decision->>'nextMinReps')::integer, (p_decision->>'nextMaxReps')::integer, p_decision->>'reasonCode', p_decision->>'explanation', p_decision->>'ruleVersion');
  insert into public.fitarc_working_set_states(user_id, exercise_key, load_kg, reps, rir, rir_confidence)
  values (v_user_id, p_exercise_key, (p_decision->>'nextLoadKg')::numeric, p_completed_reps, p_reported_rir, p_rir_confidence)
  on conflict (user_id, exercise_key) do update set load_kg = excluded.load_kg, reps = excluded.reps, rir = excluded.rir, rir_confidence = excluded.rir_confidence, updated_at = now();
  return v_result_id;
end;
$$;
