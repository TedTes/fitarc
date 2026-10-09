import { Platform } from 'react-native';

// Shared app palette. Dim tones are reserved for secondary metadata.
export const colors = {
  ground: '#08090b',
  surface: '#0c0e12',
  surfaceInset: '#0e1116',
  tile: '#11161a',
  surfaceRaised: '#12141a',
  border: '#1c1f26',
  borderStrong: '#2a2e37',
  borderCard: '#23262e',
  text: '#f2f3f5',
  textSecondary: '#cdd6e4',
  textDim: '#565c66',
  textFaint: '#4a5560',
  textMuted: '#8a919c',
  // Orange marks ready/rest states and navigation; green marks confirmation and completed work.
  accent: '#f5893c',
  accentSoft: '#1a130b',
  accentBorder: '#3a2a12',
  accentText: '#1A0E05',
  // Meaning colours, as in a diff: green beat it, red lost it, amber is a warning, violet is runtime identity.
  success: '#35d07f',
  successSoft: '#0e2a1a',
  successBorder: '#1f5c3a',
  successInk: '#07100a',
  warning: '#F5C04A',
  warningSoft: '#2A2110',
  danger: '#F87171',
  dangerSoft: '#2B1416',
  violet: '#A78BFA',
  // Upcoming work on the muscle map: blue is the one hue that stays readable over the orange-lit skin.
  next: '#60A5FA',
  violetSoft: '#1B1730',
  scrim: 'rgba(0,0,0,0.62)',
  orange: '#f5893c',
  orangeText: '#1A0E05',
  diffGreen: '#35d07f',
  diffGreenBg: '#12261B',
  diffRed: '#F87171',
  diffRedBg: '#2B1416',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Fallback monospace face, used until JetBrains Mono has loaded (or if it fails to). */
export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' }) as string;

/** Minimum size for anything tappable (Apple HIG). */
export const TOUCH = 48;

/** Text follows the system size setting but is capped so layouts stay intact. */
export const MAX_FONT_SCALE = 2.1;

/** Routine editor dimensions shared by Plan, picker and workout sheets. */
export const planTokens = {
  gap:9, chipGap:7, segmentGap:6, gutter:16, bodyGap:16,
  pad: { tiny:4, small:8, medium:12, field:14, row:15, body:16, header:20 },
  radius: { card:14, row:13, segment:9, pill:20, tile:8 },
  type: { overline:10.5, meta:11, chip:13, tile:13, segment:14, row:14.5, button:15, ghost:14.5, dashed:13.5, title:22 },
  lineHeight: { meta:16, body:20, title:28 },
  tracking: { label:0.5, header:1 },
  tile:30, muscleTile:44, icon:16, touch:44, button:50, border:1,
  duration:180, disabled:0.45, pressed:0.7, primaryFlex:1.7,
} as const;

/** Workout-complete sheet: one scroll region below the pinned hero. */
export const completeTokens = {
  surface:'#0a0c11', scrim:'rgba(4,5,7,0.74)', radius:24, heightFraction:0.92,
  openDuration:260, fadeDuration:200, closeDuration:200, swipeFraction:0.25, swipeVelocity:0.7,
  gripWidth:38, gripHeight:4, checkSize:46, headerHeight:28,
  titleSize:23, statSize:19, statLabel:9.5, setSize:13, setColumn:52, setPadding:2, recapPadding:12,
} as const;
