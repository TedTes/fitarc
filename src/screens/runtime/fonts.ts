import { useFonts } from 'expo-font';

// JetBrains Mono (SIL OFL, see assets/fonts). Each weight is its own face, so weight is chosen by family name.
const FACES = {
  'JetBrainsMono-Regular': require('../../../assets/fonts/JetBrainsMono_400Regular.ttf'),
  'JetBrainsMono-SemiBold': require('../../../assets/fonts/JetBrainsMono_600SemiBold.ttf'),
  'JetBrainsMono-Bold': require('../../../assets/fonts/JetBrainsMono_700Bold.ttf'),
};

let ready = false;

/** Family for a monospace weight, or undefined while the fallback face should be used. */
export const monoFace = (weight: '400' | '600' | '700' | '800'): string | undefined => {
  if (!ready) return undefined;
  return weight === '400' ? 'JetBrainsMono-Regular' : weight === '600' ? 'JetBrainsMono-SemiBold' : 'JetBrainsMono-Bold';
};

/** Loads the mono faces. Resolves to true once done; a load failure also resolves so the app never blocks on a font. */
export const useMonoFonts = (): boolean => {
  const [loaded, error] = useFonts(FACES);
  if (loaded) ready = true;
  return loaded || Boolean(error);
};
