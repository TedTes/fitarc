# FitArc implementation microsteps

Planning checkpoint: 2026-09-27. Implementation is proceeding one step at a time. Completed checkboxes link to recorded evidence; deployment remains separate.

Current state: the seven-table model, plain-language app flow, remaining-week adaptation and landing alignment are implemented locally. Automated validation is recorded in release-readiness.md. Real-user testing and full hosted verification are pending; the user reports manual table deployment and login working. Legacy decommissioning was pushed in `7a5a114` and `e1ef501`. Preserve unrelated scratch files and draft artwork. The user has now authorized grouped commits and a push after reporting manual database setup and login working.

Product direction: help existing lifters keep useful training going when their available time, equipment, or weekly schedule changes. Treat that positioning as a hypothesis to validate. Programmers may be the first test audience; there is no established programmer-specific training method in this app.

## Batch 1 — Establish contracts

- [x] 01. Record the current git diff and run the existing checks before changing behavior. Done: all baseline checks passed; no existing failures found. See [baseline report](implementation-baseline.md).
- [x] 02. Record the seven target tables: `fitarc_profiles`, `fitarc_exercise_catalog`, `fitarc_plans`, `fitarc_sessions`, `fitarc_session_exercises`, `fitarc_sets`, `fitarc_sync_heads`. Done: SQL and TypeScript use one agreed entity map inside the dedicated `fitarc` schema.
- [x] 03. Define plain-language UI vocabulary. Done: Today, My plan, Progress, Profile, Training preferences, Create my plan, Update my plan, Start workout, Finish workout are mapped to current actions.
- [x] 04. Specify plan identity and revision rules. Done: each plan revision has its own immutable row ID; revisions within the same training cycle share a stable plan-group ID and date boundaries. A new training cycle gets a new group. Sessions reference the precise revision that generated them.
- [x] 05. Specify one set record. Done: prescribed load/rep range/effort remain separate from actual load/reps/effort; pending/skipped sets have no fabricated actual values; a recorded adjustment includes its recommendation, reason, and rule version.

## Batch 2 — Simplify storage

- [x] 06. Move current training preferences into the profile, including goal, equipment, availability, limitations, exclusions, and initial working weights. Done: preferences round-trip without restoring defaults accidentally.
- [x] 07. Define `fitarc_plans` with the preference snapshot, date boundaries, planned weekly schedule, phases, muscle targets, and frozen exercise definitions. Done: old plan revisions can be reconstructed without current profile/catalog data.
- [x] 08. Replace the separate configuration and block rows with the plan representation. Done: no independent training-configuration table is required; rule changes and deliberate plan updates create explicit revisions.
- [x] 09. Rename session lifts to session exercises and update relationships. Done: exercise order and historical definition snapshots survive save/reload and substitution.
- [x] 10. Merge results into sets. Done: each set retains both prescribed and actual values; logging or retrying cannot create a second result for the same set.
- [x] 11. Merge adjustment decisions into sets. Done: the decision remains attached to the exact set that triggered it, with the engine rule version.
- [x] 12. Derive working-set baselines from recorded sets and their adjustments. Done: next recommendations, initial seed weights, effort confidence, undo, and substitutions match the current behavior without a separately persisted exercise-state table. An in-memory cache is allowed.
- [x] 13. Update transactional save/read RPCs for the seven tables. Done: ownership checks, revision conflicts, retry receipts, and atomic writes still hold. Keep the existing simple graph transport for this iteration; incremental sync is separate work.
- [x] 14. Update the device envelope and cloud adapters. Done: the older local 11-table representation cannot be silently interpreted as the new format; use an explicit local adapter or preserve it under its old cache key.
- [x] 15. Rewrite the unpublished schema migration and update the 23-exercise seed tooling. Done: a clean local database ends with exactly seven new FitArc tables. Keep the already-pushed decommissioning migration intact unless a specific dependency requires a forward correction.
- [x] 16. Run database and offline tests. Done: plan/history round trips, user isolation, null actual values, undo/discard, duplicate retries, lost acknowledgments, delayed network writes, and two-device conflicts pass.

## Batch 3 — Connect the engine and catalog

- [x] 17. Update runtime types and state transformations to match the simplified storage model. Done: removed persistent tables are not recreated as independent mutable state collections. Technical function names can remain where useful; user-facing text must be plain.
- [x] 18. Connect generation, substitutions, set logging, and progress views to the new representation. Done: existing engine contract tests pass before adding new adaptation behavior.
- [x] 19. Verify approved-catalog loading, offline fallback, and external-import preparation. Done: imported exercise IDs work in generated workouts and swaps; missing metadata and duplicates remain review issues; drafts never enter workout selection.
- [x] 20. Define the behavior of workouts without a plan. Done: a nullable plan reference is supported by storage; the existing generated-plan flow remains intact. A full manual workout builder is a separate scope, not implied by the nullable reference.

## Batch 4 — Make the app understandable

- [x] 21. Rename primary navigation to Today, My plan, Progress, Profile. Done: navigation labels and screen-reader labels agree.
- [x] 22. Replace source/compile/recompile/block/solver/commit in visible headings, buttons, confirmation dialogs, errors, notifications, and accessibility labels. Done: users see preferences, plans, workouts, and specific actions.
- [x] 23. Replace internal version strings and diagnostic prose with meaningful context. Done: the UI shows information such as “Week 2 of 6” and a short explanation of what changed; internal identifiers remain available to debugging tools.
- [x] 24. Add a pre-workout check for time, recovery, and equipment availability. Done: entering Today does not automatically create an active workout; an existing workout can be resumed and a new workout starts only on an explicit action.
- [x] 25. Show a workout preview before starting. Done: the user can see exercises, suggested sets, estimated duration, and a concise explanation of relevant adjustments.
- [x] 26. Make set logging show the next concrete action. Done: recording a set produces understandable guidance, and finishing a workout shows completed work and the next planned workout.

## Batch 5 — Deliver the proposed product promise

- [x] 27. Let users describe changes to the remaining week. Done: the app knows which remaining days and time windows are available instead of inferring a new schedule from a missed calendar date alone.
- [x] 28. Calculate completed and remaining weekly work across plan revisions within the same training cycle. Done: changing preferences or rescheduling cannot make already completed sets disappear from weekly totals.
- [x] 29. Replan only remaining work using available time, equipment, recovery, and exercise continuity. Done: completed workouts and logged sets stay unchanged; the revised plan remains within the existing workload rules.
- [x] 30. Handle insufficient capacity explicitly. Done: a missed workout does not automatically double the next workout; the app explains which targets are unlikely to be met with the remaining availability.
- [x] 31. Show the proposed changes before applying them. Done: users can understand and accept the updated remaining week; the revision is saved and its explanation is available later.
- [x] 32. Connect the muscle map to these decisions. Done: tapping a muscle shows completed work, remaining planned work, and the workouts/exercises covering it. These are training-volume estimates, not measurements of growth or exact recovery.
- [x] 33. Validate the full interruption scenario. Done: a user misses one planned workout, has 35 minutes for another, and finds the rack unavailable; FitArc supplies a compatible workout, keeps completed work counted, and explains the adjusted remaining week.

## Batch 6 — Verify and prepare for release

- [x] 34. Run TypeScript, runtime, database, muscle-map, and landing-preview checks plus an iOS export. Done: the exact candidate changes pass; test real devices separately for native behavior and offline restart.
- [x] 35. Update the landing page's vocabulary and examples to match behavior actually implemented in the app. Done: the site does not promise automatic weekly replanning before batch 5 works.
- [ ] 36. Test the new workflow with existing lifters, including programmers if that remains the initial audience. Done: record whether people understand the changes, need less manual replanning, and complete useful workouts; revise positioning from evidence.
- [x] 37. Update schema/import/deployment documentation and prepare reviewable change groups. Suggested groups: schema and persistence; engine/catalog integration; app language and workout flow; remaining-week adaptation and muscle map; landing/documentation alignment. Keep each group buildable.
- [ ] 38. At deployment time, check the actual hosted migration ledger and remaining legacy tables. Done: decide migration order from the real database state, including whether the retirement migration was already applied; preserve shared authentication/storage. Apply migrations, commit, and push only under the authorization given for that later task.

Suggested milestones: steps 1–20 produce a simpler internal model; steps 21–26 make the existing product understandable; steps 27–33 implement the proposed differentiation. Renaming the UI alone does not complete the product promise.

Steps 02–05: entity map and record contracts are in `src/runtime/dataModel.ts` and [training-contracts.md](training-contracts.md).

Steps 06–20: seven-table migration, profile preferences, canonical set records, derived engine projections, v3 device/wire format, catalog generation and substitutions, and nullable workout plan references are implemented. Database tests cover the entity map, snapshots, null actuals, profile preference round trips, standalone storage, undo, isolation, and sync behavior.

Steps 21–35 and 37: implementation and local verification are recorded in [release-readiness.md](release-readiness.md). Step 36 requires participation by real lifters; a test script is prepared. Step 38 is partially complete through manual deployment reported by the user; the hosted ledger and authenticated save/read smoke test remain unverified. Neither external step is claimed fully complete.

Schema organization follow-up: all seven tables and both training RPCs are now defined in `fitarc`. The app targets that schema; data checks verify request headers, namespace separation, grants, RLS and preservation of shared-project objects. Hosted deployment must also expose `fitarc` in the Data API settings.
