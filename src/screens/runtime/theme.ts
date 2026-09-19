import { Platform } from 'react-native';

// Palette carried over from the original runtime screen. Secondary and muted text were
// lightened so every text tone meets 4.5:1 on the dark ground.
export const colors = {
  ground: '#090B0F',
  surface: '#0E1116',
  surfaceRaised: '#141922',
  border: '#232A35',
  borderStrong: '#3A4352',
  text: '#F3F5F8',
  textSecondary: '#B7BEC9',
  textMuted: '#8590A0',
  // One accent: orange marks the primary action, the selected value and the brand dot.
  accent: '#F48D4D',
  accentSoft: '#2A1B10',
  accentText: '#1A0E05',
  // Meaning colours, as in a diff: green beat it, red lost it, amber is a warning, violet is runtime identity.
  success: '#5BE08A',
  successSoft: '#12261B',
  warning: '#F5C04A',
  warningSoft: '#2A2110',
  danger: '#F87171',
  dangerSoft: '#2B1416',
  violet: '#A78BFA',
  violetSoft: '#1B1730',
  scrim: 'rgba(0,0,0,0.62)',
  orange: '#F48D4D',
  orangeText: '#1A0E05',
  diffGreen: '#5BE08A',
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
