import { ActivityIndicator, Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ATHLETE_ARTWORK } from './athleteArtwork';
import { colors } from '../screens/runtime/theme';

/** Decorative registered artwork; it never intercepts auth controls or announces anatomy. */
export const AthleteBackdrop = ({ loading = false }: { loading?: boolean }) => {
  const { width, height } = useWindowDimensions();
  const figureHeight = Math.min(height * (loading ? 0.79 : 0.88), 880);
  const figureWidth = figureHeight * 2 / 3;
  return (
    <View pointerEvents="none" style={styles.backdrop} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={ATHLETE_ARTWORK.front} resizeMode="contain" fadeDuration={0} accessible={false}
        style={{ position: 'absolute', width: figureWidth, height: figureHeight, left: (width - figureWidth) / 2, top: height * 0.055, opacity: loading ? 0.56 : 0.48 }} />
      <LinearGradient
        colors={['rgba(9,11,15,0.76)', 'rgba(9,11,15,0.08)', 'rgba(9,11,15,0.5)', colors.ground]}
        locations={[0, 0.28, 0.57, 0.86]} style={StyleSheet.absoluteFill}
      />
    </View>
  );
};

export const AthleteLoadingScreen = ({ message = 'Preparing your training…' }: { message?: string }) => (
  <View style={styles.loading}>
    <AthleteBackdrop loading />
    <View style={styles.loadingCopy} accessible accessibilityRole="progressbar" accessibilityLabel={message} accessibilityState={{ busy: true }}>
      <Text style={styles.brand} maxFontSizeMultiplier={1.5}>fitarc<Text style={styles.dot}>.</Text></Text>
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={styles.message} maxFontSizeMultiplier={1.5}>{message}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  loading: { flex: 1, backgroundColor: colors.ground, justifyContent: 'flex-end' },
  loadingCopy: { alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingBottom: '18%', paddingTop: 24 },
  brand: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  dot: { color: colors.accent },
  message: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
