import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { ExerciseDefinition, TrainingSource } from '../../runtime/types';
import { Button, Choice, Txt } from './ui';
import { colors, radius, space } from './theme';

export const QuickWorkout = ({ catalog, source, onStart }: { catalog: ExerciseDefinition[]; source: TrainingSource; onStart: (exerciseId: string) => string | undefined }) => {
  const [query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState('');
  const available=catalog.filter(e=>!source.excludedExerciseIds.includes(e.id) && !e.contraindications.some(tag=>source.limitations.includes(tag)) && e.equipment.every(item=>source.equipment.includes(item)));
  const matches=available.filter(e=>e.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <View style={{gap:space.md}}>
    <Txt variant="heading">First exercise</Txt>
    <TextInput accessibilityLabel="Search exercises" value={query} onChangeText={setQuery} placeholder="Search exercises" placeholderTextColor={colors.textMuted} style={{minHeight:48,padding:12,borderWidth:1,borderColor:colors.borderStrong,borderRadius:radius.md,color:colors.text}} />
    {matches.map(e=><Choice key={e.id} label={e.name} selected={selected===e.id} onPress={()=>{setSelected(e.id);setError('');}} />)}
    {!matches.length?<Txt tone="muted">No matching exercises</Txt>:null}
    {selected?<Txt variant="caption" tone="secondary">{available.find(e=>e.id===selected)?.name} · 3 × 8–12</Txt>:null}
    {error?<Txt tone="danger">{error}</Txt>:null}
    <Button label="Start workout" disabled={!selected} onPress={()=>{if(selected)setError(onStart(selected)??'');}} />
  </View>;
};
