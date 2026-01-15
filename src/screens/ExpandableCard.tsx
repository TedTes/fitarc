// ExpandableCard.tsx
import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = {
  bgTertiary: '#1E2340',
  accent: '#6C63FF',
  border: 'rgba(255,255,255,0.06)',
  textSecondary: '#A0A3BD',
};

interface ExpandableCardProps {
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  totalCount: number;
  visibleCount: number;
  style?: any;
}

export const ExpandableCard: React.FC<ExpandableCardProps> = ({
  children,
  expanded,
  onToggle,
  totalCount,
  visibleCount,
  style,
}) => {
  const chevronRotation = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const hasMore = totalCount > visibleCount;
  const moreCount = totalCount - visibleCount;

  useEffect(() => {
    Animated.spring(chevronRotation, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 150,
    }).start();
  }, [expanded, chevronRotation]);

  const chevronRotate = chevronRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={[styles.container, style]}>
      {children}
      {hasMore && (
        <TouchableOpacity
          style={styles.expandButton}
          onPress={onToggle}
          activeOpacity={0.7}
        >
          <View style={styles.expandButtonContent}>
            <Text style={styles.expandButtonText}>
              {expanded ? 'Show Less' : `Show ${moreCount} More`}
            </Text>
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Text style={styles.expandChevron}>▾</Text>
            </Animated.View>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  expandButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bgTertiary,
    alignItems: 'center',
  },
  expandButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
    letterSpacing: 0.3,
  },
  expandChevron: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
});
