import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './ui';
import { colors, space, planTokens as t } from './theme';

export const EmptyToday = ({ onAddRoutine, onLogWorkout }: { onAddRoutine: () => void; onLogWorkout: () => void }) => (
  <View style={styles.root}>
    <Txt variant="title" accessibilityRole="header" style={styles.title}>Today</Txt>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
      <View style={styles.message}>
        <View style={styles.symbol}><Ionicons name="barbell" size={27} color={colors.accent} /></View>
        <Txt variant="heading" style={styles.heading}>Ready when you are</Txt>
        <Txt variant="caption" tone="secondary" style={styles.description}>Add the routine you already follow, and FitArc will track it and suggest adjustments as you go.</Txt>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add your routine" onPress={onAddRoutine} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Txt variant="heading" style={styles.primaryText}>Add your routine</Txt><Ionicons name="arrow-forward" size={t.icon} color={colors.accentText} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="New workout" onPress={onLogWorkout} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Ionicons name="add" size={t.type.chip} color={colors.accent}/><Txt variant="heading" tone="muted" style={styles.secondaryText}>New workout</Txt>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </View>
);
const styles=StyleSheet.create({
  root:{flex:1},title:{paddingHorizontal:space.xl,paddingTop:t.pad.header},scroll:{flex:1},
  body:{flexGrow:1,justifyContent:'center',padding:space.xl},
  message:{alignItems:'center',alignSelf:'center',width:'100%',maxWidth:280},
  symbol:{width:68,height:68,borderRadius:22,borderWidth:t.border,borderColor:colors.border,backgroundColor:colors.surface,alignItems:'center',justifyContent:'center',marginBottom:space.xl},
  heading:{fontSize:20,lineHeight:26,textAlign:'center',marginBottom:space.sm},description:{textAlign:'center',lineHeight:20},
  actions:{alignItems:'center',marginTop:space.xl,gap:t.segmentGap},
  primary:{minHeight:t.button,borderRadius:t.button/2,backgroundColor:colors.accent,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:space.sm,paddingHorizontal:space.xl,paddingVertical:space.md},
  primaryText:{color:colors.accentText,fontSize:t.type.button,fontWeight:'700'},secondary:{minHeight:t.touch,flexDirection:'row',gap:t.pad.tiny,alignItems:'center',justifyContent:'center',paddingHorizontal:space.md},secondaryText:{fontSize:t.type.chip},pressed:{opacity:t.pressed},
});
