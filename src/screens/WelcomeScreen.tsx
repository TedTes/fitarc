import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type WelcomeScreenProps = {
  onGetStarted: () => void;
};

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => (
  <View style={styles.container}>
    <LinearGradient colors={['#0A0E27', '#151932', '#1E2340']} style={styles.gradient}>
      <View style={styles.content}>
        <Text style={styles.title}>FitArc</Text>
        <Text style={styles.subtitle}>Smarter workouts that adapt to you.</Text>
        <TouchableOpacity style={styles.button} onPress={onGetStarted}>
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0E27' },
  gradient: { flex: 1, justifyContent: 'center', padding: 20 },
  content: { alignItems: 'flex-start' },
  title: { fontSize: 42, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { marginTop: 8, fontSize: 16, color: '#C7CCE6', marginBottom: 28 },
  button: {
    borderRadius: 12,
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
