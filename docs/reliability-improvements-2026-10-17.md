# Reliability improvements — October 17, 2026

Implemented after the user reported the App Store release deployed. These changes keep the existing screen layout and require no database migration or Edge Function deployment.

## Changes

1. Workout sync retries transient failures after 2, 5, 15, 30 and then 60 seconds while foregrounded. Returning to the app retries immediately. Conflicts still require an explicit choice. Empty offline launches re-read cloud history before attempting a write. Database requests have a 15-second abort timeout.
2. Profile streaks use local calendar dates and Monday–Sunday weeks, matching Progress and the workout calendar. A week still in progress does not break the previous streak.
3. Elapsed/rest clocks update their own components instead of rerendering the exercise list each second. Timers pause their updates in the background and calculate elapsed time from timestamps when resumed.
4. Profile edits, routine descriptions and routine names flush on screen exit or backgrounding. Profile writes have a persistent, per-account outbox; failed uploads survive reopening and retry on profile load, another save or foregrounding. A late upload cannot acknowledge a newer edit.
5. Rapid preview edits compose against the latest workout. Logging the first set promotes that preview once. Delete/Undo captures the current exercise, preserving a set logged immediately before deletion.

## Validation completed

- `npm run typecheck`
- `npm run reliability:check`: real React components/hooks with native adapters mocked; retries, timeouts, autosave lifecycle, durable profile recovery, date boundaries, swipe direction/cancellation, rapid edits, logging, swaps, deletion/Undo, completion/reopening and timer render isolation.
- `npm run data:check`: embedded PostgreSQL migrations, routing, RLS, transactions, persistence, conflicts and catalog parity.
- `npm run routine-reuse:check`
- `npm run routine-setup:check`
- `npm run onboarding:check`
- `npm run next-workout:check`
- `npm run workout-summary:check`
- `npm run runtime:check`
- `npx expo export --platform ios --output-dir /tmp/fitarc-reliability-ios-export`

The React test renderer matches the installed React version and is a development dependency. It emits a deprecation notice; it is not bundled into the app.

## Remaining device verification

The iOS export validates the JavaScript bundle, not a signed native archive. Native gestures, keyboards and OS suspension have not been tested on an installed build in this pass. Before the next release, check an offline workout and profile edit followed by restart/reconnection, timer background/resume, rapid log/delete/Undo and switching accounts. Background flushes begin promptly but cannot guarantee disk completion if the OS terminates the app immediately.

No hosted database writes, production deployment or App Store upload were performed for this work.
