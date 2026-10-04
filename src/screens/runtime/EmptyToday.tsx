import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './ui';
import { colors, space } from './theme';

export const EmptyToday = ({ onAddRoutine, onLogWorkout }: { onAddRoutine: () => void; onLogWorkout: () => void }) => (
  <View style={styles.root}>
    <Txt variant="title" accessibilityRole="header" style={styles.title}>Today</Txt>
    <ScrollView contentContainerStyle={styles.body}>
      <View style={styles.message}>
        <View style={styles.symbol}><Ionicons name="barbell" size={27} color={colors.accent} /></View>
        <Txt variant="heading" style={styles.heading}>Ready when you are</Txt>
        <Txt variant="caption" tone="secondary" style={styles.description}>Add the routine you already follow, and FitArc will track it and suggest adjustments as you go.</Txt>
      </View>
    </ScrollView>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Add your routine" onPress={onAddRoutine} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
        <Txt style={styles.primaryText}>Add your routine</Txt><Ionicons name="arrow-forward" size={18} color={colors.accentText} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="New workout" onPress={onLogWorkout} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
        <Txt variant="caption" tone="secondary">+ New workout</Txt>
      </Pressable>
    </View>
  </View>
);
const styles=StyleSheet.create({
  root:{flex:1},title:{paddingHorizontal:24,paddingTop:20},
  body:{flexGrow:1,justifyContent:'center',padding:24,paddingBottom:56},
  message:{alignItems:'center',alignSelf:'center',maxWidth:340,gap:12},
  symbol:{width:68,height:68,borderRadius:22,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',marginBottom:8},
  heading:{fontSize:20,lineHeight:26,textAlign:'center'},description:{textAlign:'center',lineHeight:20},
  actions:{paddingHorizontal:24,paddingTop:space.md,paddingBottom:space.md,gap:6},
  primary:{minHeight:50,borderRadius:14,backgroundColor:colors.accent,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:12},
  primaryText:{color:colors.accentText,fontSize:15,fontWeight:'700'},secondary:{minHeight:44,alignItems:'center',justifyContent:'center'},pressed:{opacity:0.75},
});
