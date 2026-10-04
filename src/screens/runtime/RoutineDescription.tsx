import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Txt } from './ui';
import { monoFace } from './fonts';
import { colors, mono } from './theme';

export type RoutineStarter = 'muscle' | 'fat_loss' | 'push_pull_legs' | 'upper_lower' | 'full_body';
const starters: Array<[RoutineStarter,string]> = [
  ['muscle','Build muscle'],['fat_loss','Lose fat'],['push_pull_legs','Push / Pull / Legs'],['upper_lower','Upper / Lower'],['full_body','Full-body 3-day'],
];

export const RoutineDescription = ({text,onChange,busy,onStarter,selectedStarters,error,voiceControl,headerAction,contextControls,bottomInset=0,onLocalReview,children,onBlur,status}: {
  text:string;onChange:(value:string)=>void;busy:boolean;onBlur?:()=>void;status?:ReactNode;children?:ReactNode;
  onStarter:(starter:RoutineStarter)=>void;selectedStarters:RoutineStarter[];error?:string;voiceControl?:ReactNode;
  headerAction?:ReactNode;contextControls?:ReactNode;bottomInset?:number;onLocalReview?:()=>void;
}) => {
  const [focused,setFocused]=useState(false);
  return <View style={styles.root}>
    <View style={styles.header}><Txt variant="title" style={styles.title}>Your routine</Txt>{status}{headerAction}</View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content,{paddingBottom:Math.max(bottomInset,16)}]} keyboardShouldPersistTaps="handled">
      <Txt variant="mono" tone="secondary" style={styles.description}>Describe it in your words — talk or type. Or start from a template below.</Txt>
      <View style={[styles.inputCard,focused&&styles.focused]}>
        <TextInput multiline textAlignVertical="top" value={text} onChangeText={onChange} onFocus={()=>setFocused(true)} onBlur={()=>{setFocused(false);onBlur?.();}}
          editable maxLength={12000} style={[styles.input,{fontFamily:monoFace('400')??mono}]} accessibilityLabel="Describe your current routine"
          placeholder={'e.g. Push / pull / legs, 4 days a week, ~60 min. Focus on chest and back. I have a barbell and dumbbells.'} placeholderTextColor={colors.textMuted}/>
        <View style={styles.micRow}><Txt variant="mono" tone="muted" style={styles.hint}>type, or tap to speak</Txt>{voiceControl}</View>
      </View>
      <View style={styles.section}><Txt variant="label" tone="muted" style={styles.sectionLabel}>CONSTRAINTS</Txt>{contextControls}</View>
      <View style={styles.section}>
        <Txt variant="label" tone="muted" style={styles.sectionLabel}>NOT SURE? START FROM</Txt>
        <View style={styles.starters}>{starters.map(([id,label])=><Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
          accessibilityState={{selected:selectedStarters.includes(id),disabled:busy}} aria-pressed={selectedStarters.includes(id)} disabled={busy} onPress={()=>onStarter(id)}
          style={({pressed})=>[styles.starter,selectedStarters.includes(id)&&styles.selected,pressed&&styles.pressed,busy&&styles.disabled]}>
          <Ionicons name="add" size={12} color={colors.accent}/><Txt variant="heading" style={styles.starterLabel}>{label}</Txt>
        </Pressable>)}</View>
      </View>
      {children}
      {error?<Txt variant="caption" tone="danger" accessibilityLiveRegion="polite">{error}</Txt>:null}
      {error&&onLocalReview?<Pressable accessibilityRole="button" accessibilityLabel="Interpret locally" disabled={busy} onPress={onLocalReview} style={styles.local}><Txt variant="caption" tone="accent">Interpret locally</Txt></Pressable>:null}
    </ScrollView>

  </View>;
};
const styles=StyleSheet.create({
  root:{flex:1},header:{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingTop:8},title:{flex:1,fontSize:21},
  scroll:{flex:1},content:{paddingHorizontal:16,paddingBottom:16,gap:14},description:{fontSize:11,lineHeight:17},
  inputCard:{borderWidth:1,borderColor:colors.borderStrong,borderRadius:16,backgroundColor:colors.surface},focused:{borderColor:colors.accent},
  input:{height:110,padding:14,paddingBottom:4,fontSize:12,lineHeight:20,color:colors.text},micRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingHorizontal:10,paddingBottom:8},hint:{fontSize:10,lineHeight:16,flexShrink:1},
  section:{gap:9,marginTop:4},sectionLabel:{fontSize:9,lineHeight:14,letterSpacing:1},starters:{flexDirection:'row',flexWrap:'wrap',gap:8},
  starter:{minHeight:36,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:12,borderWidth:1,borderColor:colors.borderStrong,borderRadius:22,backgroundColor:colors.surface},starterLabel:{fontSize:12,lineHeight:17},selected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},
  disabled:{opacity:0.5},pressed:{opacity:0.8},local:{minHeight:44,justifyContent:'center'},
});
