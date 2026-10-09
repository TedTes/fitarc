import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseDefinition, Muscle } from '../../runtime/types';
import { ExercisePicker } from './RoutineWorkoutSheet';
import { PlanText, planStyles as s, usePlanMotion } from './PlanKit';
import { colors } from './theme';

export const TodayExercisePicker=({catalog,onAdd,onClose,initialMuscles=[],selectedIds=[],title='Add exercise'}:{catalog:ExerciseDefinition[];initialMuscles?:Muscle[];selectedIds?:string[];title?:string;onAdd:(exercise:ExerciseDefinition)=>void;onClose:()=>void})=>{
  const insets=useSafeAreaInsets(),{reduced}=usePlanMotion();
  return <Modal visible animationType={reduced?'none':'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView style={[s.sheet,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==='ios'?'padding':undefined} accessibilityViewIsModal>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={({pressed})=>({width:44,height:44,alignItems:'center',justifyContent:'center',opacity:pressed?0.6:1})}>
          <Ionicons name="chevron-back" size={26} color={colors.text}/>
        </Pressable>
        <View style={s.flex}><PlanText kind="title">{title}</PlanText></View>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <ExercisePicker initialMuscles={initialMuscles} catalog={catalog} selectedIds={selectedIds} onAdd={onAdd}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
};
