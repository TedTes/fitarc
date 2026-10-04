import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseDefinition } from '../../runtime/types';
import { ExercisePicker } from './RoutineWorkoutSheet';
import { PlanButton, PlanText, planStyles as s, usePlanMotion } from './PlanKit';

export const TodayExercisePicker=({catalog,onAdd,onClose}:{catalog:ExerciseDefinition[];onAdd:(exercise:ExerciseDefinition)=>void;onClose:()=>void})=>{
  const insets=useSafeAreaInsets(),{reduced}=usePlanMotion();
  return <Modal visible animationType={reduced?'none':'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView style={[s.sheet,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==='ios'?'padding':undefined} accessibilityViewIsModal>
      <View style={s.header}>
        <View style={s.flex}><PlanText kind="title">Add exercise</PlanText></View>
        <PlanButton variant="ghost" label="Back" onPress={onClose}/>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <ExercisePicker catalog={catalog} selectedIds={[]} onAdd={onAdd}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
};
