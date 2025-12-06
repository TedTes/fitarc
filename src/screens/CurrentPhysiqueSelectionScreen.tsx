import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { getPhysiqueLevelsBySex } from '../data/physiqueLevels';

type CurrentPhysiqueSelectionScreenProps = {
  sex: 'male' | 'female' | 'other';
  onSelectLevel: (levelId: number) => void;
  onUploadPhoto: (photoUri: string) => void;
};

export const CurrentPhysiqueSelectionScreen: React.FC<CurrentPhysiqueSelectionScreenProps> = ({
  sex,
  onSelectLevel,
  onUploadPhoto,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [uploadedPhotoUri, setUploadedPhotoUri] = useState<string | null>(null);

  const physiqueLevels = getPhysiqueLevelsBySex(sex);

  const handlePhotoUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadedPhotoUri(result.assets[0].uri);
      setSelectedLevel(null);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setUploadedPhotoUri(result.assets[0].uri);
      setSelectedLevel(null);
    }
  };

  const handleContinue = () => {
    if (uploadedPhotoUri) {
      onUploadPhoto(uploadedPhotoUri);
    } else if (selectedLevel) {
      onSelectLevel(selectedLevel);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Where are you now?</Text>
            <Text style={styles.subtitle}>
              Select the physique that best matches your current state
            </Text>
          </View>

          <View style={styles.uploadSection}>
            <Text style={styles.uploadTitle}>Upload Your Photo (Optional)</Text>
            <View style={styles.uploadButtons}>
              <TouchableOpacity style={styles.uploadButton} onPress={handleTakePhoto}>
                <LinearGradient
                  colors={['#6C63FF', '#5449CC']}
                  style={styles.uploadButtonGradient}
                >
                  <Text style={styles.uploadButtonText}>📷 Take Photo</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity style={styles.uploadButton} onPress={handlePhotoUpload}>
                <View style={styles.uploadButtonOutline}>
                  <Text style={styles.uploadButtonTextOutline}>🖼️ Choose Photo</Text>
                </View>
              </TouchableOpacity>
            </View>

            {uploadedPhotoUri && (
              <View style={styles.uploadedPreview}>
                <Image source={{ uri: uploadedPhotoUri }} style={styles.uploadedImage} />
                <TouchableOpacity 
                  style={styles.removeButton}
                  onPress={() => setUploadedPhotoUri(null)}
                >
                  <Text style={styles.removeButtonText}>✕ Remove</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR SELECT</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.levelGrid}>
            {physiqueLevels.map((level) => (
              <TouchableOpacity
                key={level.id}
                style={[
                  styles.levelCard,
                  selectedLevel === level.id && styles.levelCardSelected,
                  uploadedPhotoUri && styles.levelCardDisabled,
                ]}
                onPress={() => {
                  if (!uploadedPhotoUri) {
                    setSelectedLevel(level.id);
                  }
                }}
                activeOpacity={uploadedPhotoUri ? 1 : 0.8}
                disabled={!!uploadedPhotoUri}
              >
                <View style={styles.levelImageContainer}>
                  <Image source={{ uri: level.imageUrl }} style={styles.levelImage} />
                  <View style={styles.levelBadge}>
                    <Text style={styles.levelBadgeText}>Level {level.id}</Text>
                  </View>
                </View>
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{level.name}</Text>
                  <Text style={styles.levelDescription}>{level.description}</Text>
                  <Text style={styles.bodyFat}>~{level.bodyFatRange} body fat</Text>
                  <View style={styles.characteristics}>
                    {level.characteristics.map((char, idx) => (
                      <View key={idx} style={styles.characteristicRow}>
                        <View style={styles.characteristicDot} />
                        <Text style={styles.characteristicText}>{char}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {selectedLevel === level.id && (
                  <View style={styles.selectedBadge}>
                    <Text style={styles.selectedBadgeText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {(selectedLevel || uploadedPhotoUri) && (
            <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
              <LinearGradient
                colors={['#6C63FF', '#5449CC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueButtonGradient}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E27',
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#A0A3BD',
    lineHeight: 24,
  },
  uploadSection: {
    marginBottom: 24,
  },
  uploadTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  uploadButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  uploadButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  uploadButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  uploadButtonOutline: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6C63FF',
    borderRadius: 12,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadButtonTextOutline: {
    color: '#6C63FF',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadedPreview: {
    marginTop: 16,
    alignItems: 'center',
  },
  uploadedImage: {
    width: 200,
    height: 250,
    borderRadius: 12,
    backgroundColor: '#1E2340',
  },
  removeButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  removeButtonText: {
    color: '#FF6B93',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2A2F4F',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 12,
    color: '#A0A3BD',
    fontWeight: '600',
  },
  levelGrid: {
    gap: 16,
    marginBottom: 24,
  },
  levelCard: {
    backgroundColor: '#151932',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2A2F4F',
    overflow: 'hidden',
    position: 'relative',
  },
  levelCardSelected: {
    borderColor: '#6C63FF',
    shadowColor: '#6C63FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  levelCardDisabled: {
    opacity: 0.3,
  },
  levelImageContainer: {
    position: 'relative',
  },
  levelImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#1E2340',
  },
  levelBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#0A0E27',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  levelBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  levelInfo: {
    padding: 16,
  },
  levelName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  levelDescription: {
    fontSize: 14,
    color: '#A0A3BD',
    marginBottom: 8,
  },
  bodyFat: {
    fontSize: 12,
    color: '#6C63FF',
    fontWeight: '600',
    marginBottom: 12,
  },
  characteristics: {
    gap: 6,
  },
  characteristicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  characteristicDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#00F5A0',
  },
  characteristicText: {
    fontSize: 13,
    color: '#A0A3BD',
  },
  selectedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00F5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    color: '#0A0E27',
    fontSize: 18,
    fontWeight: 'bold',
  },
  continueButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  continueButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});