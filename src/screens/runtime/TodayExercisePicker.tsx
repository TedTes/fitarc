import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseDefinition, Muscle } from '../../runtime/types';
import { ExercisePicker } from './RoutineWorkoutSheet';
import { PlanButton, PlanText, planStyles as s, usePlanMotion } from './PlanKit';

export const TodayExercisePicker=({catalog,onAdd,onClose,initialMuscles=[],selectedIds=[],title='Add exercise'}:{catalog:ExerciseDefinition[];initialMuscles?:Muscle[];selectedIds?:string[];title?:string;onAdd:(exercise:ExerciseDefinition)=>void;onClose:()=>void})=>{
  const insets=useSafeAreaInsets(),{reduced}=usePlanMotion();
  return <Modal visible animationType={reduced?'none':'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView style={[s.sheet,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==='ios'?'padding':undefined} accessibilityViewIsModal>
      <View style={s.header}>
        <View style={s.flex}><PlanText kind="title">{title}</PlanText></View>
        <PlanButton variant="ghost" label="Back" onPress={onClose}/>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <ExercisePicker initialMuscles={initialMuscles} catalog={catalog} selectedIds={selectedIds} onAdd={onAdd}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
};
