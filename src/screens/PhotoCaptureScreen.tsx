import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { PhotoCheckin } from '../types/domain';

type PhotoCaptureScreenProps = {
  onComplete: (photo: PhotoCheckin) => void;
  phasePlanId: string;
};

export const PhotoCaptureScreen: React.FC<PhotoCaptureScreenProps> = ({ onComplete, phasePlanId }) => {
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [sideUri, setSideUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is needed to take photos');
      return false;
    }
    return true;
  };

  const takePhoto = async (position: 'front' | 'side' | 'back') => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (position === 'front') setFrontUri(uri);
      else if (position === 'side') setSideUri(uri);
      else setBackUri(uri);
    }
  };

  const pickFromGallery = async (position: 'front' | 'side' | 'back') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (position === 'front') setFrontUri(uri);
      else if (position === 'side') setSideUri(uri);
      else setBackUri(uri);
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
      backUri: backUri || undefined,
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
            <Text style={styles.captureButtonText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galleryButton} onPress={onPickGallery}>
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Capture Progress Photos</Text>
      <Text style={styles.description}>
        Take photos to track your physique progress
      </Text>

      <PhotoSlot
        label="Front View"
        uri={frontUri}
        onTakePhoto={() => takePhoto('front')}
        onPickGallery={() => pickFromGallery('front')}
        required
      />

      <PhotoSlot
        label="Side View"
        uri={sideUri}
        onTakePhoto={() => takePhoto('side')}
        onPickGallery={() => pickFromGallery('side')}
      />

      <PhotoSlot
        label="Back View"
        uri={backUri}
        onTakePhoto={() => takePhoto('back')}
        onPickGallery={() => pickFromGallery('back')}
      />

      <TouchableOpacity 
        style={[styles.submitButton, !frontUri && styles.submitButtonDisabled]} 
        onPress={handleSubmit}
        disabled={!frontUri}
      >
        <Text style={styles.submitButtonText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  photoSlot: {
    marginBottom: 32,
  },
  photoLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  required: {
    color: '#f44336',
  },
  photoPlaceholder: {
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  photoPreview: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  captureButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  galleryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  galleryButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  retakeButton: {
    backgroundColor: '#666',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  retakeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
