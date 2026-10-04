# Routine-first training

Current UI checkpoint (2026-10-03): [conversational-setup.md](conversational-setup.md) describes optional setup, the three-tab dashboard, Plan accordion, staged Add workout, docked set logging and Profile. The implementation steps below document the earlier routine-first foundation; its old entry and planned-progress UI descriptions are historical.


This supersedes the fixed day-count/split assumptions in the earlier implementation baseline. The app supports an existing routine or a guided starting plan, followed by user-controlled edits and history-based suggestions. Sharing and trainer/AI integrations are outside this change.

The subsequent [conversational setup change](conversational-setup.md) replaces the initial long form with description input, compact draft review and optional transcription. It preserves this training model and save behavior.

## Completed implementation steps

1. **Model:** `TrainingSource.routine` holds structure independently of 1–7 available days, ordered workouts, per-exercise working-set counts/rep ranges/effort/optional reported starting weights, and progression settings. Private exercise definitions are kept with the routine. Existing sources without this field retain legacy behavior until explicitly edited.
2. **Intake:** initial runtime setup asks for an existing routine or a guided structure. It no longer generates a plan automatically on entry. The profile form defers routine selection to intake.
3. **Editing:** My plan → Edit routine adds/removes/reorders workouts and exercises and changes targets. Save creates an immutable plan revision. Today-only edits remain separate; the workout summary offers an explicit confirmation to use today's retained exercises/sets as the future routine.
4. **Scheduling:** sequence position comes from finished occurrences, across weeks and plan revisions. Missed dates and previews do not advance it. Today supports an explicit workout choice and extra-workout override. Remaining-week previews can repeat a workout type. New routines continue beyond six weeks without forcing a fixed periodization cycle. Legacy plans keep their existing phase behavior.
5. **Tracking:** the existing actual-weight/reps/effort logger, undo, rest, skip, reorder, offline outbox and history work with routine prescriptions. A menu action adds exercises for today (currently 3 sets of 8–12; routine editing supports other targets). Unknown starting weights require an explicit entry in the logger; zero represents no external load, not a guessed strength level.
6. **Muscle progress:** new routines count workout occurrences, including repeated types. Completed sets with reps give one primary-muscle credit and half a secondary credit. Completed and completed-plus-planned map views are separate. The week picker uses seven-day periods anchored to the routine start. Credits and weekly target ranges are estimates, not measured recovery or growth.
7. **Progression:** next-workout suggestions use the same exercise's completed session history. Defaults require two sessions on distinct dates with every prescribed working set at the upper rep target and the required effort, at the same load. Missing/skipped sets, changed targets, reduced recovery, recovery phases and inconsistent loads do not earn an increase. Users configure 1–5 successful sessions, effort threshold, exercise increments, manual mode and optional between-set adjustments. Suggestions can be overridden by logging the actual weight.
8. **Alternatives:** compatible movement/muscle/equipment candidates explain prior use or an unfamiliar baseline. Acceptance is explicit in Today or the logger; substitutions do not transfer another exercise's weight. Missing catalog entries can be added privately with user-supplied muscle, equipment and movement tags. Their setup/fatigue values use disclosed defaults rather than claiming specialist assessment.
9. **Verification:** model, sequencing, progress, progression, replacement, PostgreSQL round-trip and UI-flow checks cover the new path alongside legacy regressions. See the evidence below.

## Storage and compatibility

No additional tables or SQL deployment are required for this change. The existing seven-table schema persists routine settings in profile preferences, frozen definitions/settings in new plan snapshots, and each actual workout/exercise/set in its own records. New optional fields are JSON payload data. Private exercises are not inserted into the shared approved catalog. Completed history is preserved across revisions. Existing stored sources and plans remain readable and retain their behavior until edited.

The existing full-graph transactional sync, ownership checks, revision conflicts, retry receipts and local outbox remain in use. This is not a change to hosted authentication or schema exposure. A native/hosted smoke test is still needed before releasing a new app binary; the agent has not deployed anything.

## Verification commands

- `npm run typecheck`
- `npm run runtime:check`
- `npm run routine:check`
- `npm run data:check`
- `npm run adaptation:check`
- `npm run muscle-map:check`
- Final Expo iOS export to `/tmp/fitarc-routine-ios-final` (bundle check, not an installed device test).

The database harness also round-trips a user routine, private exercise, actual set and frozen catalog through the existing SQL functions while preserving earlier completed sessions. The private exercise never becomes a shared catalog row.

Local screen harness: `/tmp/fitarc-routine-review/`. It runs actual intake, routine editing, Today, logger and Progress components with the real runtime in React Native Web. Native alerts, font/icon/safe-area boundaries, authentication, cloud navigation and device storage are replaced by test boundaries. It is not an authenticated or native integration test.

## Scope limits

The routine editor supports one working-set prescription per exercise (sets, rep range and effort); per-set pyramids, supersets and timed/distance-only exercises are not modeled. Routine ordering and history are user-controlled; this is not an AI coach. Exercise recommendations offer alternatives rather than infer technique or medical suitability from logs. Private muscle tags are user-supplied. Calendar dates for the remaining week are selectable; usual availability is a days-per-week count rather than a recurring weekday calendar.

The headless screen flow passed at 320px and 390px: routine intake, private exercise creation, optional substitution, actual-weight logging, completion, muscle progress, routine editing and state restoration. No page errors or horizontal page overflow were observed. The existing landing preview parity check also passes; landing copy was not revised in this task.
