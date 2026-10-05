import { StyleSheet, View } from 'react-native';
import type { SessionPrescription } from '../../runtime/types';
import { useWeightSettings } from './WeightSettings';
import { weightText } from '../../runtime/weights';
import { colors, radius, space } from './theme';
import { Txt } from './ui';

export const WorkoutResults=({session}:{session:SessionPrescription})=>{
  const {unit}=useWeightSettings();
  const exercises=session.exercises.map(entry=>({...entry,logged:entry.sets.filter(set=>set.status==='completed'&&set.result)})).filter(entry=>entry.logged.length);
  const sets=exercises.reduce((sum,entry)=>sum+entry.logged.length,0);
  return <View style={{gap:space.md}}>
    <Txt variant="caption" tone="secondary">{exercises.length} exercises · {sets} recorded sets</Txt>
    <View style={styles.list}>
      {exercises.map((entry,index)=><View key={entry.id} style={[styles.entry,index>0&&styles.border]}>
        <Txt variant="heading">{entry.exercise.name}</Txt>
        {entry.logged.map(set=><View key={set.id} style={styles.row}>
          <Txt variant="caption" tone="muted">Set {set.setNumber}</Txt>
          <Txt variant="caption">{weightText(set.result!.actualLoadKg??set.result!.prescribedLoadKg,unit)} {unit} × {set.result!.completedReps}</Txt>
          <Txt variant="caption" tone="secondary">RIR {set.result!.reportedRir}</Txt>
        </View>)}
      </View>)}
    </View>
  </View>;
};
const styles=StyleSheet.create({
  list:{borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,overflow:'hidden'},
  entry:{padding:space.md,gap:space.sm,backgroundColor:colors.surface},border:{borderTopWidth:1,borderTopColor:colors.border},
  row:{flexDirection:'row',justifyContent:'space-between',gap:space.sm},
});
