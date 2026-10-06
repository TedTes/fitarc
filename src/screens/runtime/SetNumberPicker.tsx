import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Sheet, Txt } from './ui';
import { PlanButton } from './PlanKit';
import { colors } from './theme';
import type { SetRowValues } from './EditableSetRow';
import type { WeightUnit } from '../../runtime/weights';

const ROW = 44;
const valuesFor = (maximum:number,step:number,current:number) => [...new Set([
  ...Array.from({length:Math.ceil(maximum/step)+1},(_,i)=>i*step),current,
])].sort((a,b)=>a-b);

const NumberWheel = ({label,values,value,onChange}:{label:string;values:number[];value:number;onChange:(value:number)=>void}) => {
  const list=useRef<FlatList<number>>(null);
  const initial=useRef(Math.max(0,values.indexOf(value)));
  const select=(index:number)=>{
    const bounded=Math.max(0,Math.min(values.length-1,index));
    onChange(values[bounded]);list.current?.scrollToOffset({offset:bounded*ROW,animated:false});
  };
  return <View style={s.column}>
    <Txt variant="label" tone="muted" style={s.label}>{label}</Txt>
    <View style={s.wheel} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{min:values[0],max:values[values.length-1],now:value}}
      accessibilityActions={[{name:'increment'},{name:'decrement'}]}
      onAccessibilityAction={event=>select(values.indexOf(value)+(event.nativeEvent.actionName==='increment'?1:-1))}>
      <View pointerEvents="none" style={s.selection}/>
      <FlatList ref={list} testID={`number-wheel-${label}`} data={values} keyExtractor={item=>String(item)}
        style={s.list} contentContainerStyle={s.items} initialScrollIndex={initial.current}
        getItemLayout={(_,index)=>({length:ROW,offset:index*ROW,index})}
        initialNumToRender={9} windowSize={3} maxToRenderPerBatch={9} nestedScrollEnabled
        showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast" bounces={false}
        onMomentumScrollEnd={event=>select(Math.round(event.nativeEvent.contentOffset.y/ROW))}
        scrollEventThrottle={32} onScroll={event=>{
          const index=Math.max(0,Math.min(values.length-1,Math.round(event.nativeEvent.contentOffset.y/ROW)));
          onChange(values[index]);
        }} renderItem={({item,index})=><Pressable accessibilityRole="button" accessibilityLabel={`${label} ${item}`}
          accessibilityState={{selected:item===value}} onPress={()=>select(index)} style={s.item}>
          <Txt variant="code" tone={item===value?'success':'muted'} style={[s.digit,item===value&&s.selectedDigit]}>{item}</Txt>
        </Pressable>}/>
      <View pointerEvents="none" style={[s.fade,{top:0}]}/><View pointerEvents="none" style={[s.fade,{bottom:0}]}/>
    </View>
  </View>;
};

export const SetNumberPicker=({setNumber,value,unit,onSave,onClose}:{setNumber:number;value:SetRowValues;unit:WeightUnit;onSave:(value:SetRowValues)=>void;onClose:()=>void})=>{
  const [draft,setDraft]=useState({load:Number(value.load)||0,reps:Number(value.reps)||0,rir:Number(value.rir)||0});
  const [weights]=useState(()=>valuesFor(1000,unit==='kg'?0.5:1,draft.load));
  const change=(key:keyof typeof draft)=>(number:number)=>setDraft(current=>current[key]===number?current:{...current,[key]:number});
  return <Sheet visible scrollable={false} title={`Set ${setNumber}`} onClose={onClose}>
    <View style={s.wheels}>
      <NumberWheel label={unit.toUpperCase()} values={weights} value={draft.load} onChange={change('load')}/>
      <NumberWheel label="REPS" values={REPS} value={draft.reps} onChange={change('reps')}/>
      <NumberWheel label="RIR" values={RIR} value={draft.rir} onChange={change('rir')}/>
    </View>
    <PlanButton label="Done" onPress={()=>onSave({load:String(draft.load),reps:String(draft.reps),rir:String(draft.rir)})}/>
  </Sheet>;
};
const REPS=Array.from({length:100},(_,i)=>i),RIR=[0,1,2,3,4,5];
const s=StyleSheet.create({
  wheels:{flexDirection:'row',gap:10},column:{flex:1,minWidth:0},label:{textAlign:'center',fontSize:11,marginBottom:8},
  wheel:{height:ROW*5,overflow:'hidden',borderRadius:12,backgroundColor:colors.ground},list:{flex:1},items:{paddingVertical:ROW*2},
  item:{height:ROW,justifyContent:'center',alignItems:'center'},digit:{fontSize:20,lineHeight:28},selectedDigit:{fontSize:24},
  selection:{position:'absolute',top:ROW*2,left:0,right:0,height:ROW,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.success,backgroundColor:colors.successSoft},
  fade:{position:'absolute',left:0,right:0,height:ROW,backgroundColor:colors.ground,opacity:0.65},
});
