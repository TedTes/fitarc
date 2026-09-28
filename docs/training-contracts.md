# Training contracts

The seven durable entities are profiles, exercise catalog, plans, sessions, session exercises, sets, and sync checkpoints. All seven and the training RPCs belong to the `fitarc` schema. The schema is exported by `TRAINING_SCHEMA`, and table names by `TRAINING_TABLES` in `src/runtime/dataModel.ts`; schema tests check this map against PostgreSQL.

Current training preferences belong to the profile. Every plan revision stores the preferences and exercise definitions used to generate it. Each revision has a distinct UUID and a stable group UUID shared with other revisions in the same training cycle. A normal update keeps that group's start date; starting the next training cycle creates a new group and start date. Session references point to the exact revision used. Weekly accounting follows the group and calendar boundaries, so updating a plan cannot erase completed work.

One set stores its prescription (weight, rep range, effort), its optional result (actual weight, reps, reported effort, completion time), and its optional adjustment (next recommendation, reason, rule version). Pending/skipped sets have no result or adjustment. Logging produces both atomically; undo removes both. Completed sets retain their original prescription even when subsequent sets change. Working weights and effort confidence are derived in recorded order from completed sets. They are an engine projection, not another independently saved table.

User-facing vocabulary: Today, My plan, Progress, Profile; Training preferences; Create my plan; Update my plan; Start workout; Finish workout; Start next training plan. Plans are described by weeks and dates, workouts by exercises and sets. Internal engine function names may remain technical.

The catalog is shared and only approved records are available to users. Every other record belongs to one authenticated user. A workout may have a null plan reference; standalone workout creation is not part of this implementation. The existing generated-workout flow always has a plan.

Remaining-week forecasts are immutable plan data, not actual session records. Applying a forecast preserves completed sessions and normal weekly slots. Only selected dates in the current plan week change. The planner reserves projected muscle credits across those dates; actual totals always come from logged results. A recovery prescription never shifts the calendar week or loses that week's evidence.
