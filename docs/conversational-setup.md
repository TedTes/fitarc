# Conversational routine setup

## Current flow (2026-10-03)

Workout setup is optional. After profile setup, the user enters Today, including an empty dashboard when no routine exists. The three tabs are Today, Progress and Profile. A one-off workout can be logged without creating a recurring routine. Opening an exercise only inspects it; the first confirmed set starts the session clock.

Profile → Training preferences opens Your routine: description and microphone input, compact split/days/time controls, optional starter chips, and Build manually / Generate routine actions. Existing routine text is prefilled. Both actions lead to Review routine; nothing is saved until Save changes. Review has one open Plan accordion at a time (Schedule & goal, Set defaults, Advanced) and expandable workout rows. Add another workout opens a separate local draft with a name, target muscles, and a searchable exercise picker. Cancel discards it; Add to routine confirms it into the still-unsaved routine draft.

Set defaults seed new exercises without rewriting existing prescriptions. Focus, defaults, target muscles and the limitations note persist in the existing routine JSON. Strength uses the existing strength engine; the other focus labels use the existing hypertrophy engine. A free-text limitations note is stored context, not an interpreted contraindication. Existing structured limitations and excluded exercises are preserved. No new SQL migration is required.

Finish saves the session and opens a read-only Workout complete sheet over Today. Time uses the saved first-set and finish timestamps; volume and set counts use logged results only. Unloaded sessions show reps instead of volume. A PR requires greater weight than the same exercise’s prior best with at least as many reps; first sessions have no PR. The sheet shows the largest weight improvement, permits X/scrim/swipe/Escape dismissal, and links to Progress. The hero stays pinned while the recap scrolls. Dismissing never writes or reopens the completed session.

Orange marks selection/readiness; green marks completion and validity. Shared tokens, selectors, rows, buttons and reduced-motion-aware transitions are in PlanKit and useLayoutMotion. Profile has compact body measurements, training settings, and a read-only Workout log of finished sessions.

Configured hosted voice retains recording controls; local-mode voice reports missing configuration when tapped. Neither transcription nor drafting creates completed sets. Unsaved draft state lasts only while the setup screen is mounted.

## Earlier implementation history (superseded by the current flow above)

1. Audited the initial form and its save contract.
2. Added **I already have a routine** and **Help me build one**.
3. Added a multiline description field with an example and preserved input during back navigation and failed requests.
4. Added an isolated draft model that distinguishes reported, saved, suggested and unknown values.
5. Added local interpretation, plus an optional authenticated hosted interpretation adapter.
6. Matched exact exercise names and explicit aliases; ambiguous matches require selection. Private exercises remain available.
7. Added compact workout summaries with expandable exercise editors, reorder, remove and add controls.
8. Added targeted checks for unresolved variants, missing weight units, combined versus per-dumbbell weights, empty workouts and duplicates. Numeric bounds are checked before saving.
9. Connected explicit save to the existing training compiler and persistence. Drafting and transcription never create workouts or history records.
10. Moved equipment, limitations, exclusions and progression into Advanced settings. Known limitations/exclusions are preserved.
11. Added a five-question guided route into the same review. Frequency and workout structure are independent; custom duration supports 10–180 minutes.
12. Added optional recording → explicit transcription → editable text → draft review. Keyboard dictation remains available without a hosted provider.
13. Added microphone-denied feedback, recording limits, background stop, upload cancellation, retry, stale-result guards, local interpretation fallback and original text preservation.
14. Verified parsing, provider boundaries, persistence, existing runtime contracts and 320px/390px screen flows.
15. Removed the redundant full-page routine editor and unused setup constants. Detailed editing remains available in the compact review.

## Defaults and scope

`EXPO_PUBLIC_ROUTINE_INPUT_MODE=local` is the default. It makes no interpretation/transcription provider requests. Local parsing supports named workout lists, sets/reps, spelled-out small numbers, kg/lb and short clauses. It is intentionally conservative: unknown exercise variants and units remain unresolved. Longer prose may need correction; the original description stays visible in review.

Missing targets are disclosed as proposed defaults (3 sets, 8–12 reps, 2 reps left). Missing weights remain unset. Availability and goal fall back to the current source values shown in review. Guided targets are marked as suggestions. Combined dumbbell weights are converted to the runtime's per-dumbbell kilograms after explicit confirmation of unit and basis.

Draft text lives only in the mounted setup screen. Back navigation and failed requests preserve it; cancelling setup, signing out or restarting the app discards unsaved drafts. Confirmed routines use the existing offline-capable persistence and seven-table model. No SQL migration is needed. Routine description/audio is not written to the training database.

Per-set pyramids, supersets and timed/distance-only exercises remain outside the existing routine model. Unsupported timed/distance clauses are called out for review rather than converted into invented strength prescriptions. This input adapter is not a trainer or exercise-recommendation model.

## Optional hosted input: manual configuration

The provider preference was not answered during implementation, so hosted processing remains disabled. To enable the implemented OpenAI adapter deliberately:

1. Deploy `supabase/functions/routine-input/index.ts` together with its `_shared/routineInput.ts` dependency to the app's Supabase project. Deployment is manual; none was performed here.
2. Configure **server-only** secrets `OPENAI_API_KEY`, `OPENAI_ROUTINE_MODEL` (a model supporting Responses structured outputs), and `OPENAI_TRANSCRIBE_MODEL` (a supported audio transcription model). Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Never place the OpenAI key in `EXPO_PUBLIC_*` variables.
3. Set the app's `EXPO_PUBLIC_ROUTINE_INPUT_MODE=hosted` and rebuild/restart the app bundle. The function verifies the signed-in bearer token against Supabase Auth before any provider call.
4. Rebuild an existing native development client/release binary for the added Expo audio module and microphone permission. The plugin does not enable background recording. No recording permission is requested on initial setup entry.
5. Smoke-test an authenticated request and microphone recording on a real device before release. Both text and audio actions disclose external processing, and users can select local interpretation instead.

The handler caps descriptions at 12,000 characters, recordings at 5 MB, validates input, uses strict output schema and server timeouts, and returns safe errors. Client-side validation checks extraction bounds and exact evidence substrings. Evidence quotes are a validation aid, not proof that every model inference is correct; user review remains required. Recording is limited to 90 seconds and requires an explicit **Transcribe recording** action. Transcripts append to existing text and remain editable. Temporary recordings are removed after successful transcription, discard or screen unmount.

The function does not write to the database, log routine text/audio or store provider responses. Text requests use `store: false`; this does not make claims about provider retention policies. Six requests per user per minute are throttled **per function isolate**, not as a durable global quota. Set provider/account spending limits or durable gateway quotas before public use.

Reference contracts: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [speech transcription](https://developers.openai.com/api/docs/guides/speech-to-text), [Expo SDK 54 audio](https://docs.expo.dev/versions/v54.0.0/sdk/audio/).

## Verification

- `npm run routine-setup:check`: local parsing, aliases/ambiguity, missing values, lb/combined-dumbbell conversion, bounds, evidence rejection, immutable drafts, confirmed-save round trip, mocked function authentication, strict output contract, size limits, refusal/incomplete response, audio path and throttling.
- `npm run typecheck`, `npm run routine:check`, `npm run runtime:check`, `npm run data:check`, `npm run adaptation:check`, `npm run muscle-map:check`.
- Local headless React Native Web harness at `/tmp/fitarc-text-setup-review`: passed at 320px and 390px for two-choice entry, text preservation/back navigation, missing-unit resolution, editing, explicit save, cancellation, private exercises, state restoration and guided setup. No page errors or horizontal overflow observed.
- Harness also checked denied microphone permission, no upload before explicit transcription, failed transcription/retry, editable append, hosted failure/local fallback and stale-request cancellation. Native recorder and provider boundaries were mocked; no real audio or authenticated hosted call was tested.
- Expo iOS export to `/tmp/fitarc-text-setup-ios-final`: bundle verification only, not an installed-device test.

No commits, pushes, hosted deployment or live database changes were made in this task.
