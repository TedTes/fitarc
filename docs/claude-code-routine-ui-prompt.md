# Prompt for Claude Code

Archived design brief. Later user instructions and [the current flow](conversational-setup.md) supersede this brief’s layout and commit restrictions.

Improve FitArc’s routine-entry UI/UX. Implement the changes in the existing app.

Read `docs/claude-code-direction-handoff.md` and inspect the actual screens and components first. The user finds the current UI visually dull and assembled from oversized generic controls. Previous attempts added explanatory paragraphs and then a detached keypad icon; both were explicitly rejected. The keypad icon has now been removed.

Latest layout requirement: one entry screen with a blank text area at the top and three compact context chips underneath (split, days per week, time). No examples/placeholders/hints. Review and “Create new workout” sit at the bottom; creation opens the guided generator in a bottom sheet. The separate route-selection screen has been removed. Preserve this newer direction.

The user's explicit requirements:

- Put a **microphone icon inside the text area**, integrated into the input itself. Do not add a separate keypad button or a detached microphone card below it.
- No explanatory paragraphs, tutorial copy, parser instructions or “Prefer speaking…” text. Use concise labels, meaningful icons and clear interaction states.
- Creatively improve the screen’s hierarchy, spacing, typography, controls and interactions. Exercise design judgment; do not merely rearrange the existing boxes. No additional visual composition or style is prescribed here.
- Make typing, recording, editing and reviewing feel like one coherent flow. Keep essential validation and accessibility labels.

Product context: people bring the routine they already follow. Typed or transcribed input becomes an editable draft; the user resolves ambiguities and explicitly saves it. A guided route is available. This is a strength-training app, not a tutorial or blog.

Relevant implementation:

- `src/screens/runtime/RoutineDescription.tsx`: text area and review action.
- `src/screens/runtime/RoutineVoiceInput.tsx`: voice capability gate; currently returns null in local mode.
- `src/screens/runtime/RoutineRecorder.tsx`: recording, stop, transcription, cancellation and retry.
- `src/screens/runtime/SourceIntake.tsx`: setup navigation, input state and save boundary.
- `src/screens/runtime/GuidedRoutine.tsx`, `RoutineDraftReview.tsx`, `ui.tsx`, `theme.ts`: generator sheet content, review and shared primitives.
- `src/services/routineInputService.ts` and `supabase/functions/routine-input/`: optional hosted interpretation/transcription.

Voice is an implementation constraint, not permission to fake the interaction. `EXPO_PUBLIC_ROUTINE_INPUT_MODE` defaults to `local`; the hosted adapter exists but has not been deployed/configured in this work. Native recording requires the Expo audio module in the app binary. Inspect this before wiring the microphone. Implement a real recording path and an honest unavailable/error state when prerequisites are absent. Tapping the mic must not merely focus the keyboard or pretend a recording succeeded. Keep any external-processing indication concise and contextual. Do not silently enable a provider or deploy backend infrastructure.

Preserve typed text during recording/transcription failures and cancellation. Transcripts remain editable. Interpretation and recording must not save a routine or fabricate completed workouts. Preserve explicit save, unknown weights, unit clarification, exercise matching, private exercises and existing training history.

Scope is routine entry and the directly connected interactions needed to make it coherent. Avoid unrelated engine, database, muscle-artwork or landing-page changes. The worktree contains uncommitted changes from earlier tasks: inspect and preserve them.

Verify the result visually at narrow phone widths and with the keyboard open. Check long input, recording/stop, permission denial, unavailable service, retry, cancellation, editable transcripts and review. Run relevant checks, including TypeScript and `npm run routine-setup:check`. Distinguish mocked checks from real-device or hosted verification.

Implement and report the result. **Do not commit, push or deploy.**
