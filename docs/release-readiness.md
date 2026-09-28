# Local implementation and release handoff

Candidate date: 2026-09-27. Steps 01–35 and 37 are implemented. The user subsequently created the hosted tables manually and reported login working after the Data API configuration fix. Grouped commits and a push were then explicitly authorized. The previous legacy decommissioning commits remain unchanged. The baseline report records the earlier 11-table state; it is intentionally historical.

## Validation

- TypeScript, runtime contracts, adaptation scenario, embedded PostgreSQL/offline checks, muscle targeting, and landing preview parity pass.
- The database check runs a clean migration chain and a legacy-cleanup fixture. Exactly seven new FitArc tables remain in `fitarc`, with no new FitArc tables/functions in `public`; shared-project sentinel tables survive. The real app client sends the custom-schema headers on database requests while storage routing stays separate; profile preferences, merged sets, immutable revisions, accepted week forecasts, standalone nullable references, owner isolation, rollback, duplicate retries and two-device conflicts round-trip.
- The interruption scenario misses Monday, records a Tuesday workout, schedules 35 minutes on Wednesday without a rack, and reduces Friday's work for reported fatigue. It verifies preserved actuals across revisions, time/equipment constraints, weekly caps, explicit apply, stale-preview rejection, no-day availability and the unchanged following week.
- Browser harness checks actual Today/Progress/SetLogger components with the real pure engine at 320px and 390px: no automatic workout start, preview before apply, rack exclusion, actual-weight logging, workout summary/Finish and no page overflow. Icons, font loading, safe-area values, cloud/auth and the app navigation shell are replaced by test boundaries. This is not a native-device or authenticated integration test. Local harness/screenshots: `/tmp/fitarc-app-review/`.
- Expo iOS production export succeeds, including a final pre-push export to `/tmp/fitarc-commit-ios-20260927`. This is a bundle check, not an installed iOS test.
- Landing browser interactions pass at 320px, 390px, 768px and 1440px: sample set/rest/swap, volume updates, muscle inspection/zoom, phase selection and FAQ, with no page errors or horizontal overflow.
- Landing production build succeeds; preview parity covers 23 exercises, both unchanged registered images and masks, part mappings and 3,200 set-adjustment cases. The restricted network prevents optional Google Fonts optimization; the build falls back without that optimization.

The custom schema must be exposed through the hosted Data API as described in [Supabase's custom-schema guide](https://supabase.com/docs/guides/api/using-custom-schemas). Auth and storage are not moved. A missing schema, missing migration or unexposed schema still prevents profile loading; schema creation alone is insufficient for API access.

## Step 36: test with real lifters (pending)

Recruit existing lifters; include programmers if they remain the intended first audience. Do not explain the old technical vocabulary. Ask each participant to:

1. Set up their preferences and explain what Today, My plan and Progress mean.
2. Describe the workout preview and start only when ready.
3. Log a set using a different weight from the suggestion, then explain the next action.
4. Assume Monday was missed and only 35 minutes remain on Wednesday, with no rack. Change the remaining week, explain the proposal and choose whether to accept it.
5. Tap a muscle and explain completed versus remaining work and any shortfall.
6. Find the next workout and explain what happens to their usual schedule next week.

Record task completion, hesitation, unintended starts/applies, whether users notice shortfalls, confidence in the changes, and manual planning still required. Ask what they would otherwise use and which concrete task FitArc made easier. Record actual observations before changing the positioning hypothesis; no participants or results are invented here.

## Native and hosted smoke checks (pending)

On an installed iOS build, check small-screen scrolling and keyboards, screen-reader labels, background/resume timers, airplane-mode logging and restart, outbox retry, sign-out/account switching, catalog fallback, and two-device conflicts. Verify selected days after midnight/timezone changes. Reopen a completed workout and confirm actual weights and old plan definitions survive.

## Step 38: manual deployment reported; ledger and full smoke test pending

The user confirmed that `fitarc.fitarc_profiles` exists and subsequently reported login working. The agent has not inspected the hosted migration ledger or completed an authenticated save/read smoke test. Do not replay the fresh migration just because SQL Editor execution is absent from the migration ledger. Inspect the intended project using read-only SQL:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select schemaname, tablename from pg_tables
where schemaname = 'fitarc' or (schemaname = 'public' and tablename like 'fitarc_%')
order by schemaname, tablename;
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'fitarc' or (n.nspname = 'public' and p.proname like 'fitarc_%');
```

- If the fresh-training and seed versions have never run: apply the dedicated `fitarc` schema and seed with the matching app. Add `fitarc` to Data API **Exposed schemas**, preserving the other exposed schemas. The migration handles grants/RLS; the dashboard setting is a separate deployment step. Apply the legacy retirement migration only if absent from the ledger and still required.
- If a prior 11-table draft or the earlier seven-table `public` draft was applied under the same version: do not replay a changed migration or simply mark it applied. Prepare an explicit forward migration for the actual schema, move the relevant tables into `fitarc`, replace/recreate the training RPCs with schema-qualified references, remove the four superseded entities only if the 11-table draft exists, verify grants/RLS and the new graph, and record the new ledger entry. Moving a function alone is insufficient because its body references the old schema. The unpublished migration is not a hosted upgrade script.
- If legacy tables were manually dropped or the retirement version already ran: check what remains and reconcile the ledger based on evidence. Avoid broad `CASCADE` or deleting unrelated objects.
- Keep shared `auth.users`, other applications' tables, storage objects and avatar policies. The delete-account function's existing shared-auth restriction is unchanged.
- Verify authenticated profile creation, approved catalog reads, save/read RPCs, owner isolation and offline retry against the deployed service before releasing the matching app. Old app binaries cannot use this fresh schema.

No access tokens or service keys belong in the handoff. Check environment configuration locally without printing secrets. Remove obsolete profile-table overrides; the new app uses `fitarc_profiles`.


### Data API configuration mismatch encountered during deployment

The API continued to return `PGRST106` (only `public, graphql_public` allowed) despite the user reporting `fitarc` in the dashboard. Resetting the role setting did not resolve that observed response. Explicitly setting the schema list and reloading the API was followed by the user's report that login worked:

```sql
-- Include every schema required by other projects. These were the two exposed schemas observed in this project.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, fitarc';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
```

This is a configuration repair for this observed deployment, not another migration to replay automatically or a reason to disable RLS. Preserve other projects' schemas if using it elsewhere. [Supabase's documented PGRST106 resolution](https://supabase.com/docs/guides/troubleshooting/pgrst106-the-schema-must-be-one-of-the-following-error-when-querying-an-exposed-schema).

The app now classifies profile-loading failures. Development builds display the error code, project hostname and schema without exposing credentials; release builds show a concise explanation. A successful anonymous schema probe does not establish that an authenticated profile or workout can be saved.

## Commit groups

The authorized changes are grouped by these review boundaries:

1. **Training data and engine:** seven-table schema, canonical records, catalog/import/seed tooling, offline persistence, plan revisions and remaining-week engine with database/runtime/adaptation checks. The controller adapter travels with the storage contract.
2. **App workflow:** plain-language navigation and onboarding, workout preview and actual-weight logging, remaining-week editor, summaries and muscle-map progress.
3. **Profile diagnostics:** distinguish deployment, access and session failures and show safe connection details in development builds.
4. **Landing alignment:** product copy and sample-screen vocabulary matching the implemented flow.
5. **Documentation:** schema, import, implementation checklist, baseline evidence and deployment handoff.

Each code boundary is checked from the staged tree before committing. Unrelated `desc.txt`, `note.txt`, `test.json` and unregistered v3 athlete artwork remain outside these commits. Registered v2 images and pixel masks are unchanged.

The pre-commit database check caught a fixture mixing a UTC workout date with the engine's local plan date. The fixture now uses the same local-date helper, and the database and adaptation checks pass.

Known scope: full-graph transactional sync remains; history pagination and operation-based sync are later work. The whole small catalog is frozen per plan; a large imported catalog will warrant versioned catalog releases. Nullable session references support standalone storage, but there is no manual workout builder. The product positioning remains a hypothesis until step 36 supplies evidence.
