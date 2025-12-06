import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoCheckin } from '../types/domain';
import { LinearGradient } from 'expo-linear-gradient';

type PhotoCaptureScreenProps = {
  onComplete: (photo: PhotoCheckin) => void;
  onSkip?: () => void;
  phasePlanId: string;
  isOptional?: boolean;
};

export const PhotoCaptureScreen: React.FC<PhotoCaptureScreenProps> = ({ 
  onComplete, 
  onSkip,
  phasePlanId,
  isOptional = false,
}) => {
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [sideUri, setSideUri] = useState<string | null>(null);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos');
      return false;
    }
    return true;
  };

  const takePhoto = async (position: 'front' | 'side') => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (position === 'front') setFrontUri(uri);
      else if (position === 'side') setSideUri(uri);
    }
  };

  const pickFromGallery = async (position: 'front' | 'side') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (position === 'front') setFrontUri(uri);
      else if (position === 'side') setSideUri(uri);
    }
  };

  const handleSubmit = () => {
    if (!frontUri) {
      Alert.alert('Required', 'Please capture at least a front photo');
      return;
    }

    const photo: PhotoCheckin = {
      id: `photo_${Date.now()}`,
      date: new Date().toISOString(),
      phasePlanId,
      frontUri,
      sideUri: sideUri || undefined,
      createdAt: new Date().toISOString(),
    };

    onComplete(photo);
  };

  const PhotoSlot = ({ 
    label, 
    uri, 
    onTakePhoto, 
    onPickGallery, 
    required 
  }: { 
    label: string; 
    uri: string | null; 
    onTakePhoto: () => void; 
    onPickGallery: () => void;
    required?: boolean;
  }) => (
    <View style={styles.photoSlot}>
      <Text style={styles.photoLabel}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      
      {uri ? (
        <View>
          <Image source={{ uri }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.retakeButton} onPress={onTakePhoto}>
            <Text style={styles.retakeButtonText}>Retake</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoPlaceholder}>
          <TouchableOpacity style={styles.captureButton} onPress={onTakePhoto}>
            <LinearGradient
              colors={['#6C63FF', '#5449CC']}
              style={styles.captureButtonGradient}
            >
              <Text style={styles.captureButtonText}>Take Photo</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryButton} onPress={onPickGallery}>
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0E27', '#151932', '#1E2340']}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>
            {isOptional ? 'Add Progress Photos (Optional)' : 'Capture Progress Photos'}
          </Text>
          <Text style={styles.description}>
            {isOptional 
              ? 'Photos help track your progress, but you can skip for now'
              : 'Take photos to track your physique progress'}
          </Text>

          <PhotoSlot
            label="Front View"
            uri={frontUri}
            onTakePhoto={() => takePhoto('front')}
            onPickGallery={() => pickFromGallery('front')}
            required={!isOptional}
          />

          <PhotoSlot
            label="Side View"
            uri={sideUri}
            onTakePhoto={() => takePhoto('side')}
            onPickGallery={() => pickFromGallery('side')}
          />

          <TouchableOpacity 
            style={[styles.submitButton, !frontUri && !isOptional && styles.submitButtonDisabled]} 
            onPress={handleSubmit}
            disabled={!frontUri && !isOptional}
          >
            <LinearGradient
              colors={frontUri || isOptional ? ['#6C63FF', '#5449CC'] : ['#2A2F4F', '#2A2F4F']}
              style={styles.submitButtonGradient}
            >
              <Text style={styles.submitButtonText}>Continue</Text>
            </LinearGradient>
          </TouchableOpacity>

          {isOptional && onSkip && (
            <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
              <Text style={styles.skipButtonText}>Skip for Now</Text>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#A0A3BD',
    marginBottom: 32,
  },
  photoSlot: {
    marginBottom: 32,
  },
  photoLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  required: {
    color: '#FF6B93',
  },
  photoPlaceholder: {
    borderWidth: 2,
    borderColor: '#2A2F4F',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#151932',
  },
  photoPreview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#1E2340',
  },
  captureButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  captureButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  galleryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  galleryButtonText: {
    color: '#6C63FF',
    fontSize: 16,
    fontWeight: '600',
  },
  retakeButton: {
    backgroundColor: '#2A2F4F',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  retakeButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 20,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  skipButtonText: {
    color: '#A0A3BD',
    fontSize: 16,
  },
});