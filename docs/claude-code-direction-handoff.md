# FitArc — product direction and implementation handoff

Current implementation (2026-10-03): optional setup leads directly to the dashboard. Today / Progress / Profile remain the three tabs. Today starts a session on the first confirmed set and uses a docked exercise card with a shared input/rest panel. Progress shows recorded training with compact muscle rows. Profile now has measurement tiles, training details, account actions and Workout log. Training preferences opens the routine description screen; Build manually / Generate routine lead to an accordion review and a staged Add workout flow. See [conversational-setup.md](conversational-setup.md) for the current behavior, persistence boundaries and limitations. The sections below record earlier product decisions; the current flow supersedes their old screen-layout descriptions.

Prepared for Claude Code on 2026-09-28. This report summarizes the user's decisions and the current local implementation. It is context for continuing the project, not authorization to deploy or delete data.

## 1. Product direction

FitArc is moving toward a strength-training companion that starts with the routine someone already follows, records what they actually do, and helps them adjust future training while keeping them in control.

The intended experience is:

> Describe how you train today. Review the routine FitArc understood. Train and record your actual sets. See which muscles you have trained. Make informed changes to weights, exercises and scheduling as your history grows.

The user questioned whether programmer-oriented terms such as “block,” “compile” and “solve” represented meaningful differentiation. The direction is to demonstrate practical value through the experience, rather than rely on technical vocabulary. Internal engine names can remain, but user-facing language should use familiar terms: routine, workout, exercise, set, progress and suggestions.

The intended reason to choose FitArc is the combination of bringing an existing routine, retaining control, seeing muscle coverage, and receiving explainable adjustments based on actual training and present constraints. This is a product proposition to validate with users; we have not established market uniqueness or superiority over competing apps.

## 2. Decisions to preserve

- **Start from the user's current training.** They should not have to abandon their routine to use the app. A guided starting routine is available when needed.
- **Support different workout structures.** Upper/lower is an option, not a required database structure or universal default. Full body, push/pull/legs and individually named workouts are supported.
- **Separate frequency from structure.** Training four days per week does not mean there must be exactly four distinct workouts. A three-workout sequence can continue across four training days and across week boundaries.
- **Keep suggestions under user control.** Users can edit routines, choose another workout, add an extra workout, substitute exercises and override suggested weights by logging actual values.
- **Distinguish temporary changes from routine changes.** Changing today's workout should not silently rewrite the ongoing routine.
- **Use completed training as evidence.** A plan, preview, parsed description or forecast is not completed training.
- **Reduce initial UI clutter.** Begin with description input or a short guided path. Show precise controls when needed, and keep advanced settings expandable.
- **Keep interface copy minimal.** The user explicitly rejected explanatory paragraphs, including “Prefer speaking…” and parser instructions. Use short labels, compact values and accessible icons. The user also rejected the separate keypad shortcut; it has been removed. Their explicit direction is a microphone inside the text area, with the UI/UX refinement handed to Claude Code. See [the focused prompt](claude-code-routine-ui-prompt.md). Recording controls currently require hosted voice configuration.
- **Preserve uncertainty.** Missing weights stay unknown; ambiguous exercise variants and weight units require clarification. Suggested defaults must be visible as suggestions.

## 3. Current user journey

### Setup

The latest user instruction consolidates setup into one screen. It opens directly to a blank text area at the top with an inset microphone. Three compact context chips underneath select split, days per week and time, one picker at a time. Review and “Create new workout” sit at the bottom; the latter opens the guided generator in a bottom sheet. Context selections feed review and generation, and the optional split preference persists in existing routine JSON without replacing explicitly entered workouts. There is no separate route-selection screen, example, placeholder or instructional hint. Closing the sheet preserves entered text.

Both routes end in the same compact review. Workouts and exercises expand for editing. Users can add, remove or reorder items, select the correct exercise variant, or define a private exercise. Schedule, goal, equipment, limitations and progression remain configurable.

This latest layout supersedes the previous requests for persistent examples and hints. Do not restore “I already have a routine,” “Help me build one,” or the two-step entry flow. Hosted recording still requires the documented configuration; local mode reports the unavailable service when its mic is tapped.

Only an explicit save applies the routine. Failed interpretation and back navigation preserve typed text. Cancelling the entire setup or restarting the app discards unsaved drafts; draft persistence across app restarts is not implemented.

### Training and adjustment

Today has since been simplified at the user's request: one compact exercise list, a persistent Start workout action, and sheets for conditions, workout selection, swaps and muscle details. The user explicitly requested no explanatory paragraphs on Today. Avoid restoring the former long introduction, duplicate alternatives list, repeated reasons or per-exercise body-map cards. Routine success notifications expire; errors remain visible.

Users preview today's workout, start it explicitly, and log actual weight, reps and effort for each set. The app supports undo, rest, skipping and exercise changes. Completed occurrences advance the routine sequence; simply previewing or missing a date does not.

Remaining-week changes are proposals using available dates, time, recovery and equipment. The user reviews and applies them. The planner accounts for completed training and estimated remaining muscle volume rather than automatically doubling missed work.

### Progress and suggestions

The muscle map distinguishes completed work from completed-plus-planned work. The current volume estimate gives a completed set one primary-muscle credit and half a secondary-muscle credit. This is an estimate of training exposure, not a measurement of growth, fatigue or recovery.

Weight increases are based on successful completed sessions, not a timer such as “every other day.” Current defaults require two qualifying sessions on distinct dates, with every prescribed working set reaching the upper rep target at the required effort and the same load. The rules, increments and manual mode are configurable. Missing/skipped sets and inconsistent performance do not automatically earn an increase.

Exercise alternatives consider compatible movement, muscle and equipment metadata and explain relevant history or the absence of a baseline. Accepting a different exercise does not copy another exercise's working weight.

## 4. What supplies the workouts

The seed contains **23 exercise definitions**, not a library of finished workout templates.

Workout content currently comes from either:

- The user's reviewed routine and selected catalog/private exercises.
- The guided engine assembling a starting routine from the approved exercise catalog and preferences.

A larger external exercise dataset has been discussed, and import/validation tooling exists. No large external dataset has been selected or integrated as part of the latest work. Names and videos alone are insufficient: the engine also needs reviewed muscle, equipment, movement and other selection metadata, plus appropriate provenance/license information.

Private exercises belong to the user's routine and do not become approved shared catalog entries automatically.

## 5. Data model

The app uses seven tables in the dedicated **`fitarc` schema**, not scattered new tables in `public`:

| Table | Role |
| --- | --- |
| `fitarc_profiles` | User profile and current training preferences, including routine settings. |
| `fitarc_exercise_catalog` | Shared exercise definitions, provenance and approval state. |
| `fitarc_plans` | Saved plan revisions with frozen preferences and exercise definitions. |
| `fitarc_sessions` | Workout occurrences and their lifecycle, tied to the exact plan revision. |
| `fitarc_session_exercises` | Ordered exercises and historical snapshots within a workout. |
| `fitarc_sets` | Prescribed sets, status, actual results and associated adjustments. |
| `fitarc_sync_heads` | Per-user sync revision, retry receipt and active-plan metadata. |

The logical flow is:

```text
Approved exercise catalog + reviewed user routine/preferences
  → saved plan revision
  → today's preview
  → explicit workout start
  → actual exercise/set records
  → derived progress and working-weight evidence
  → future suggestions or a reviewed plan revision
```

The routine-first and conversational setup changes use the existing model; they do not require additional tables or SQL migrations. Routine configuration and private exercise definitions are carried in existing JSON preferences/snapshots. Actual sessions, exercises and sets retain their own rows.

New routines are ongoing. A fixed six-week cycle is not a requirement for the new experience. Older code paths remain compatible with existing legacy-format plan objects until edited. Some historical documentation still describes six-week plans; the newer routine-first behavior takes precedence.

The earlier fresh-start database cleanup was explicitly authorized because there were no legacy users to preserve. **That does not authorize deleting current training records or repeating destructive cleanup.** Current history must survive routine changes. Shared Supabase auth, storage and other projects' data must remain intact.

## 6. AI and voice: implemented versus enabled

Local interpretation is the current default. It parses simple descriptions without sending them to an AI provider. Phone-keyboard dictation can populate the same text field.

An optional OpenAI interpretation/transcription adapter and authenticated Supabase Edge Function have been implemented. They are **not deployed or enabled by this work**. The provider-choice question was unanswered, so OpenAI must not be described as an approved production dependency or live feature yet.

The optional path is:

```text
Record → explicitly transcribe → edit transcript → interpret → review → save
```

It requires server-only credentials/model configuration, manual function deployment, `EXPO_PUBLIC_ROUTINE_INPUT_MODE=hosted`, and a native rebuild for the audio module/permission. Recording and provider requests require deliberate actions. The function authenticates the user and does not write training data.

The AI adapter extracts routine information; it is not an autonomous trainer. Weight progression and workout adjustment remain rule-based. Model output is validated and reviewed rather than treated as authoritative training history.

## 7. Muscle artwork and landing-page context

The anatomical body and interactive muscle highlighting are established parts of the product. Earlier work included anatomical refinements and black bodybuilding trunks. The current registered app assets are `assets/images/muscle-map/athlete-front-v2.png` and `athlete-back-v2.png`.

**Precise highlighting depends on the existing image registration.** Do not regenerate, crop, reposition or resize body artwork casually: that can invalidate mapped regions. Any intentional artwork change needs mapping/parity verification. Untracked `athlete-*-v3.png` files in the landing directory are not evidence that the app has switched assets.

The user previously requested coordinated app and landing-page changes. The latest routine/setup implementation did not revise landing-page messaging. Any future landing work should reflect the actual product direction and clearly distinguish live features from optional or future integrations. This handoff does not prescribe a visual redesign.

## 8. Delivery status and verification limits

The local worktree contains uncommitted routine-first engine/UI changes and the subsequent conversational setup work. Read `git status` and the diffs before editing; do not assume all current work exists on the remote branch. There are also unrelated untracked notes/data and artwork files; preserve them.

Previously completed local checks passed:

- TypeScript checks.
- Routine, progression, scheduling, adaptation and muscle-map contracts.
- Parsing, draft validation, unit conversion and mocked provider tests.
- Embedded PostgreSQL tests for the data model, ownership/RLS, atomic saves, retries and conflicts.
- Headless UI flows at 320px and 390px, including draft review, explicit save, cancellation and voice failure/retry paths with mocked native/provider boundaries.
- Expo iOS bundle export.

These are not proof of a successful installed-device microphone session or authenticated hosted transcription. No real-device recording or live hosted AI request was verified. Supabase deployment is manual; the user reported creating tables and later restoring login, but the live migration ledger was not independently verified.

No commit, push, database deployment or Edge Function deployment was performed during the latest routine/setup implementation. Do not inherit older commit/push requests as a blanket instruction for new work.

## 9. Open work and unresolved choices

These are gaps to discuss or validate, not an approved instruction to implement every item:

- Real-device and authenticated hosted smoke tests before release.
- Provider choice, credentials and deployment if dedicated voice/hosted interpretation is wanted.
- Better parsing coverage or hosted interpretation evaluation using realistic descriptions.
- A reviewed larger exercise dataset.
- Sharing progress with a personal trainer or AI trainer: discussed as a possible extension, not implemented.
- Per-set pyramids, supersets and timed/distance exercise support: outside the current prescription model.
- Recurring weekday availability: current usual availability is a days-per-week count; remaining-week dates can be selected explicitly.
- Persisting unsaved setup drafts across restart, if desired.
- Scaling beyond full-graph sync and whole-catalog plan snapshots as histories/catalogs grow.
- Durable hosted-input quotas before public use; current throttling is per function isolate.

## 10. Where to read next

Read these in order for implementation details:

1. [Routine-first behavior](routine-first-implementation.md).
2. [Conversational setup and optional voice configuration](conversational-setup.md).
3. [Tables, sync and database deployment](training-data-model.md), accounting for its historical six-week wording.
4. [Exercise import](exercise-import.md).
5. [Release readiness](release-readiness.md).

Key implementation locations:

- `src/screens/runtime/SourceIntake.tsx`: setup routes and save boundary.
- `src/routineSetup/`: isolated drafts, local interpretation, validation and exercise matching.
- `src/screens/runtime/RoutineDescription.tsx`, `RoutineDraftReview.tsx`, `GuidedRoutine.tsx`, `TrainingSettings.tsx`: unified entry, compact review and guided/advanced controls.
- `src/runtime/routine.ts`, `sequence.ts`, `progression.ts`, `recommendations.ts`: routine behavior and suggestions.
- `src/runtime/runtimeService.ts`, `trainingState.ts`, `runtimePersistence.ts`: transitions, storage representation and offline persistence.
- `src/services/routineInputService.ts` and `supabase/functions/routine-input/`: optional hosted input.
- `scripts/check-routine.cjs`, `scripts/check-routine-setup.cjs`, `scripts/check-data-model.cjs`: relevant contract checks.

When continuing, prioritize the user's routine, clarity, explicit acceptance and accurate historical records. Evaluate proposed changes against those decisions before introducing more terminology, setup fields or automatic behavior.
