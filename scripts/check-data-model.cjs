require('./lib/load-typescript.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { createRuntimePersistence, emptyRuntimeState, retainTrainingHistory } = require('../src/runtime/runtimePersistence.ts');
const { toStoredTraining, fromStoredTraining } = require('../src/runtime/trainingState.ts');
const { TRAINING_SCHEMA, TRAINING_TABLES } = require('../src/runtime/dataModel.ts');
const { RUNTIME_EXERCISES } = require('../src/runtime/exerciseCatalog.ts');
const { compileTrainingBlock, solveTrainingSession, recordRuntimeSet, undoLastRuntimeSet, discardRuntimeSession, compileNextRuntimeBlock, commitRuntimeSession, getSwapCandidates, substituteRuntimeExercise } = require('../src/runtime/runtimeService.ts');
const { prepareCatalogImport } = require('../src/runtime/catalogImport.ts');
const { validateCatalog } = require('../src/runtime/catalogValidation.ts');
const { previewRemainingWeek, applyRemainingWeek } = require('../src/runtime/remainingWeek.ts');
const { datePlusDays, localDate } = require('../src/runtime/planDates.ts');
const { createRuntimeId } = require('../src/runtime/id.ts');
const uid = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000002';
const source = { id: createRuntimeId(), userId: uid, version: 1, goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 4, sessionMinutes: 60,
  equipment: ['barbell','rack','dumbbell','bench','machine','cable','pullup_bar'], excludedExerciseIds: [], limitations: [], seedWorkingSets: [], createdAt: new Date().toISOString() };
const ctx = { date: localDate(), minutesAvailable: 60, recovery: 'yes', unavailableExerciseIds: [], unavailableEquipment: [] };
function apply(state, change) { return retainTrainingHistory(state, change(state)); }
function logSet(state) {
  const entry = state.activeSession.exercises.find(x => x.sets.some(s => s.status === 'pending'));
  const set = entry.sets.find(x => x.status === 'pending');
  return recordRuntimeSet(state, { prescriptionId: state.activeSession.id, setId: set.id, exerciseId: entry.exercise.id,
    prescribedLoadKg: set.loadKg, prescribedMinReps: set.minReps, prescribedMaxReps: set.maxReps, targetRir: set.targetRir,
    completedReps: set.maxReps, reportedRir: set.targetRir, completedAt: new Date().toISOString() });
}
async function main() {
  validateCatalog(RUNTIME_EXERCISES);
  const external = RUNTIME_EXERCISES.map(x => ({ ...x, id: `external_${x.id}`, name: `Imported ${x.name}` }));
  let state = apply({ ...emptyRuntimeState(), catalog: external }, s => compileTrainingBlock(s, source));
  assert(state.block.slots.every(slot => slot.plannedExercises.every(x => x.exerciseId.startsWith('external_'))));
  state = apply(state, s => solveTrainingSession(s, ctx));
  assert(state.activeSession.exercises.every(x => x.exercise.id.startsWith('external_')));
  const firstId = state.activeSession.exercises[0].exercise.id;
  const candidates = getSwapCandidates(state, firstId, 10);
  assert(candidates.length > 0);
  state = substituteRuntimeExercise(state, firstId, candidates[0].id);
  state = logSet(state);
  assert.equal(state.setResults.length, 1);
  // A live catalog edit must not change the block or existing session's definitions.
  external[0].name = 'Changed after compilation';
  assert.notEqual(state.block.catalog[0].name, external[0].name);
  const fields = Object.fromEntries(Object.keys(RUNTIME_EXERCISES[0]).map(k => [k,k]));
  const manifest = { source: 'test', sourceUrl: 'https://example.org/dataset', license: 'test-only', fields };
  const imported = prepareCatalogImport([RUNTIME_EXERCISES[0], RUNTIME_EXERCISES[0], { id: 'incomplete', name: 'Incomplete' }], manifest);
  assert.equal(imported.drafts.length, 1); assert.equal(imported.drafts[0].status, 'draft'); assert.equal(imported.issues.length, 2);
  assert.throws(() => validateCatalog([{ ...RUNTIME_EXERCISES[0], incrementKg: 0 }]));
  assert.throws(() => validateCatalog([{ ...RUNTIME_EXERCISES[0], primaryMuscles: ['unknown'] }]));

  const db = await PGlite.create();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${uid}'),('${other}');`);
  // Shared-project sentinel objects must survive schema creation, writes and legacy cleanup.
  await db.exec("create table public.other_project_records(id integer primary key, value text); insert into public.other_project_records values(1,'keep'); create schema other_project; create table other_project.profiles(id integer primary key); insert into other_project.profiles values(7);");
  // PGlite includes gen_random_uuid; extension provisioning belongs to hosted Supabase.
  await db.exec('create table public.fitarc_exercises(id uuid primary key)');
  await db.exec(fs.readFileSync('supabase/legacy/202609170001_training_runtime.sql','utf8').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(fs.readFileSync('supabase/migrations/202609240001_fresh_training.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202609240002_seed_exercise_catalog.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/202609240003_retire_legacy_training.sql','utf8'));
  assert.equal((await db.query("select to_regclass('public.fitarc_runtime_state') as old")).rows[0].old,null);
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,2);
  assert.equal((await db.query("select value from public.other_project_records where id=1")).rows[0].value,'keep');
  assert.equal((await db.query('select id from other_project.profiles')).rows[0].id,7);
  assert.equal((await db.query("select has_schema_privilege('authenticated',$1,'USAGE') as allowed",[TRAINING_SCHEMA])).rows[0].allowed,true);
  assert.equal((await db.query("select has_schema_privilege('anon',$1,'USAGE') as allowed",[TRAINING_SCHEMA])).rows[0].allowed,false);
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  const save = async (s, revision, mutation = createRuntimeId()) => {
    const payload = toStoredTraining(s);
    return (await db.query('select fitarc.fitarc_save_training($1::jsonb,$2::bigint,$3::uuid) as result', [JSON.stringify(payload),revision,mutation])).rows[0].result;
  };
  const read = async () => { const result = (await db.query('select fitarc.fitarc_read_training() as result')).rows[0].result; return { ...result, state: result.state ? fromStoredTraining(result.state) : null }; };
  assert.equal((await db.query('select * from fitarc.fitarc_exercise_catalog')).rows.length, 23);
  await assert.rejects(db.exec("insert into fitarc.fitarc_exercise_catalog values('bad','bad','bad','bad','bad','approved','{}',now())"));
  const mutation = createRuntimeId();
  assert.deepEqual(await save(state, 0, mutation), { revision: 1, conflict: false });
  assert.deepEqual(await save(state, 0, mutation), { revision: 1, conflict: false });
  assert.deepEqual(await save(state, 0), { revision: 1, conflict: true });
  let restored = (await read()).state;
  for (const key of ['source','block','activeSession','sessions','setResults','workingSets','decisions']) assert.deepEqual(restored[key], state[key], key);
  assert.equal((await db.query("select adjustment from fitarc.fitarc_sets where status='completed'")).rows.length, 1);
  const changedConfig = structuredClone(state); changedConfig.block.preferences.daysPerWeek = 5;
  await assert.rejects(save(changedConfig,1));
  const changedBlock = structuredClone(state); changedBlock.block.catalog[0].name = 'Historical rewrite';
  await assert.rejects(save(changedBlock,1));
  const invalidAdjustment = structuredClone(state);
  const loggedSet = invalidAdjustment.sessions.flatMap(s=>s.exercises).flatMap(e=>e.sets).find(s=>s.status==='completed');
  delete loggedSet.decision.nextLoadKg;
  await assert.rejects(save(invalidAdjustment,1));
  const invalid = structuredClone(state); invalid.setResults[0].exerciseId = 'wrong';
  await assert.rejects(save(invalid,1));
  assert.equal((await read()).revision, 1); // All deletes/inserts rolled back.
  assert.equal((await read()).state.setResults.length,1);
  await assert.rejects(save({ ...state, source: { ...source, userId: other } },1));
  await assert.rejects(db.exec(`delete from fitarc.fitarc_sessions where user_id='${uid}'`));
  await db.exec(`set request.jwt.claim.sub = '${other}'`);
  assert.equal((await db.query('select * from fitarc.fitarc_sessions')).rows.length,0);
  assert.equal((await read()).state,null);
  await assert.rejects(save(state,0));
  await assert.rejects(db.exec(`insert into fitarc.fitarc_profiles(user_id,name) values('${uid}','intruder')`));
  await db.exec(`set role anon; set request.jwt.claim.sub = '';`);
  await assert.rejects(read());
  await assert.rejects(save(state,0));
  await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`);
  const undone = undoLastRuntimeSet(restored);
  await save(undone,1);
  assert.equal((await read()).state.setResults.length,0);
  assert.equal((await db.query("select adjustment from fitarc.fitarc_sets where status='completed'")).rows.length,0);
  const discarded = discardRuntimeSession(undone);
  await save(discarded,2);
  assert.equal((await read()).state.sessions.length,0);
  let next = apply(discarded,s => compileNextRuntimeBlock(s));
  await save(next,3);
  assert.equal((await db.query('select * from fitarc.fitarc_plans')).rows.length,2);
  next = apply(next,s => solveTrainingSession(s,ctx)); next = logSet(next);
  next = commitRuntimeSession(next);
  await save(next,4);
  restored = (await read()).state;
  assert.equal(restored.activeSession,null); assert.equal(restored.committedSessionIds.length,1);
  assert.equal(restored.setResults.length,1);
  const pendingRows = (await db.query("select actual_load_kg,actual_reps,adjustment from fitarc.fitarc_sets where status<>'completed'")).rows;
  assert(pendingRows.every(x=>x.actual_load_kg===null && x.actual_reps===null && x.adjustment===null));
  const profile = (await db.query('select training_preferences from fitarc.fitarc_profiles')).rows[0];
  assert.deepEqual(profile.training_preferences,next.source);
  const standalone = structuredClone(next);
  standalone.sessions = standalone.sessions.map(s=>({...s,blockId:null,planGroupId:undefined}));
  await save(standalone,5);
  assert.equal((await read()).state.sessions[0].blockId,null);
  const altered = apply(discarded,s=>solveTrainingSession(s,ctx));
  const entry = altered.activeSession.exercises[0]; const target = entry.sets[0];
  const actual = recordRuntimeSet(altered,{ prescriptionId:altered.activeSession.id,setId:target.id,exerciseId:entry.exercise.id,
    prescribedLoadKg:target.loadKg,prescribedMinReps:target.minReps,prescribedMaxReps:target.maxReps,targetRir:target.targetRir,
    actualLoadKg:7,completedReps:target.maxReps,reportedRir:2,completedAt:new Date().toISOString() });
  assert.equal(actual.activeSession.exercises[0].sets[0].loadKg,target.loadKg);
  assert.equal(actual.setResults[0].actualLoadKg,7);
  assert.deepEqual(fromStoredTraining(toStoredTraining(actual)).workingSets,actual.workingSets);
  assert.deepEqual(undoLastRuntimeSet(actual).workingSets,{});
  const scheduleDay = datePlusDays(next.block.startedOn, 1);
  const proposal = previewRemainingWeek(next,[{...ctx,date:scheduleDay,minutesAvailable:35,unavailableEquipment:['rack']}],ctx.date);
  const replanned = applyRemainingWeek(next,proposal);
  await save(replanned,6);
  const roundTrip = (await read()).state;
  assert.deepEqual(roundTrip.block.remainingWeek,replanned.block.remainingWeek);
  assert.deepEqual(roundTrip.sessions,next.sessions);
  assert(roundTrip.blockHistory.some(x=>x.id===next.block.id));
  await db.close();
  // Separately verify the entire active migration chain against an empty app schema.
  const freshDb = await PGlite.create();
  await freshDb.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`);
  for (const file of fs.readdirSync('supabase/migrations').filter(x => x.endsWith('.sql')).sort()) {
    await freshDb.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  assert.equal((await freshDb.query('select count(*)::int as n from fitarc.fitarc_exercise_catalog')).rows[0].n,23);
  assert.equal((await freshDb.query("select count(*)::int as n from pg_tables where schemaname='fitarc'")).rows[0].n,7);
  assert.deepEqual((await freshDb.query("select tablename from pg_tables where schemaname='fitarc' order by tablename")).rows.map(x=>x.tablename),Object.values(TRAINING_TABLES).sort());
  assert.equal((await freshDb.query("select count(*)::int as n from pg_tables where schemaname='public' and tablename like 'fitarc_%'")).rows[0].n,0);
  assert.deepEqual((await freshDb.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 order by p.proname",[TRAINING_SCHEMA])).rows.map(x=>x.proname),['fitarc_read_training','fitarc_save_training']);
  assert.equal((await freshDb.query("select to_regprocedure('public.fitarc_read_training()') as old")).rows[0].old,null);
  await freshDb.exec('set role service_role');
  assert.equal((await freshDb.query('select count(*)::int as n from fitarc.fitarc_exercise_catalog')).rows[0].n,23);
  await freshDb.close();

  // Device persistence: offline writes, restart, lost acknowledgment, subsequent edits, and conflicts.
  let local = null; let remote = { revision: 0, mutationId: null, state: null }; let online = false; let loseAck = false; let backups = 0;
  const persistence = createRuntimePersistence({
    createId: createRuntimeId, readLocal: async () => structuredClone(local), writeLocal: async v => { local = structuredClone(v); },
    backup: async () => { backups++; },
    readRemote: async () => { if (!online) throw Error('offline'); return structuredClone(remote); },
    writeRemote: async (s, revision, mutationId) => {
      assert(local, 'device save precedes cloud');
      if (revision !== remote.revision) return { revision: remote.revision, conflict: true };
      remote = { revision: revision+1, mutationId, state: structuredClone(s) };
      if (loseAck) { loseAck = false; throw Error('lost response'); }
      return { revision: remote.revision, conflict: false };
    },
  });
  assert.equal((await persistence.save(state)).cloud, 'unavailable');
  assert.deepEqual((await persistence.load()).state.setResults, state.setResults);
  online = true; loseAck = true;
  assert.equal((await persistence.load()).cloud, 'unavailable');
  assert.equal(remote.revision, 1);
  assert.equal((await persistence.save(undone)).cloud, 'synced');
  assert.equal(remote.revision, 2); assert.equal(remote.state.setResults.length, 0);
  online = false; await persistence.save(next);
  remote = { revision: 3, mutationId: createRuntimeId(), state: discarded }; online = true;
  assert.equal((await persistence.load()).cloud, 'conflict');
  assert.equal((await persistence.save(next)).cloud, 'conflict');
  assert.equal(remote.revision, 3); assert.equal(local.state.sessions.length,next.sessions.length);
  await persistence.useCloud(); assert.equal(backups,1); assert.deepEqual((await persistence.load()).state,discarded);
  let unblock;
  const waiting = new Promise(resolve => { unblock = resolve; });
  let delayedLocal = null;
  let delayedRemote = { revision: 0, mutationId: null, state: null };
  let firstRequest = true;
  const slow = createRuntimePersistence({ createId: createRuntimeId,
    readLocal: async () => structuredClone(delayedLocal), writeLocal: async value => { delayedLocal = structuredClone(value); },
    backup: async () => {}, readRemote: async () => {
      if (firstRequest) { firstRequest = false; await waiting; }
      return structuredClone(delayedRemote);
    },
    writeRemote: async (value, revision, mutationId) => {
      delayedRemote = { revision: revision+1, mutationId, state: structuredClone(value) };
      return { revision: revision+1, conflict: false };
    },
  });
  await slow.stage(state);
  const flushing = slow.flush();
  await slow.stage(undone); // Must be durable while the previous request is still blocked.
  assert.equal(delayedLocal.state.setResults.length,0);
  unblock();
  await flushing;
  assert.equal(delayedRemote.state.setResults.length,0);
  assert.equal(delayedLocal.pendingId,null);
  console.log('Data model checks passed: catalog imports, injected generation/swaps, PostgreSQL round trips, RLS, rollback, idempotency, undo/discard, version history, offline saves, lost responses, conflicts.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
