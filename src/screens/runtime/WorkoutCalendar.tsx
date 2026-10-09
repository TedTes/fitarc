import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { datePlusDays } from '../../runtime/planDates';
import { isWorkoutDate, nextWorkoutDate, toggleWorkoutDate, type WorkoutSchedule } from '../../runtime/workoutSchedule';
import { Button, Sheet, Txt } from './ui';
import { colors } from './theme';

export const WorkoutCalendar=({schedule,today,onSave,onClose}:{schedule?:WorkoutSchedule;today:string;onSave:(value:WorkoutSchedule|undefined)=>void;onClose:()=>void})=>{
  const [draft,setDraft]=useState<WorkoutSchedule>(()=>schedule??{weekdays:[],addedDates:[],skippedDates:[]});
  const [month,setMonth]=useState(today.slice(0,7));
  const marked:Record<string,{selected?:boolean;selectedColor?:string;disabled?:boolean;disableTouchEvent?:boolean}>={};
  for(let i=0;i<31;i++){
    const date=datePlusDays(`${month}-01`,i);
    if(date.slice(0,7)!==month)break;
    if(date<today)marked[date]={disabled:true,disableTouchEvent:true};
    else if(isWorkoutDate(draft,date))marked[date]={selected:true,selectedColor:colors.accent};
  }
  const next=nextWorkoutDate(draft,today);
  return <Sheet visible title="Workout days" onClose={onClose}>
    <Txt variant="caption" tone="secondary">Choose your usual weekdays, or tap individual dates. Your next session follows these days; the workout order stays the same.</Txt>
    <View style={s.days}>{[1,2,3,4,5,6,0].map(day=>{
      const selected=draft.weekdays.includes(day),label=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day];
      return <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{checked:selected}}
        style={[s.day,selected&&s.daySelected]} onPress={()=>setDraft(current=>({...current,weekdays:selected?current.weekdays.filter(d=>d!==day):[...current.weekdays,day]}))}>
        <Txt variant="mono" tone={selected?'accent':'secondary'} style={s.dayText}>{label}</Txt>
      </Pressable>;
    })}</View>
    <Calendar current={today} minDate={today} firstDay={1} markedDates={marked} onMonthChange={value=>setMonth(value.dateString.slice(0,7))}
      onDayPress={value=>{if(value.dateString>=today)setDraft(current=>toggleWorkoutDate(current,value.dateString));}}
      theme={{calendarBackground:colors.surface,monthTextColor:colors.text,dayTextColor:colors.text,todayTextColor:colors.accent,textDisabledColor:colors.textDim,arrowColor:colors.accent,selectedDayTextColor:colors.ground,textSectionTitleColor:colors.textMuted}}
      style={s.calendar}/>
    <Txt variant="caption" tone="secondary">{next?`Selected days begin ${next}. Completed days stay in your history.`:'No upcoming dates selected. Add a date, choose a weekday, or use a flexible schedule.'}</Txt>
    <Button label="Save workout days" disabled={!next} onPress={()=>onSave(draft)}/>
    <Button label="Use flexible schedule" variant="ghost" onPress={()=>onSave(undefined)}/>
  </Sheet>;
};
const s=StyleSheet.create({days:{flexDirection:'row',gap:4},day:{flex:1,minHeight:44,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:colors.border,borderRadius:8},daySelected:{borderColor:colors.accent,backgroundColor:colors.accentSoft},dayText:{fontSize:11},calendar:{borderRadius:12,overflow:'hidden'}});
