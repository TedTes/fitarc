import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, mono, planTokens as t } from './theme';
import { headingFace, monoFace } from './fonts';

import { useLayoutMotion as usePlanMotion } from './useLayoutMotion';
export { useLayoutMotion as usePlanMotion } from './useLayoutMotion';

export const PlanText=({children,kind='body',accent=false,success=false,bold=false}:{children:ReactNode;kind?:'body'|'title'|'meta'|'overline';accent?:boolean;success?:boolean;bold?:boolean})=><Text style={[s.text,kind==='title'?s.title:kind==='meta'?s.meta:kind==='overline'?s.overline:null,{fontFamily:kind==='meta'||kind==='overline'?(monoFace(bold?'700':'400')??mono):headingFace()},bold&&s.bold,accent&&s.accent,success&&s.success]}>{children}</Text>;
export const PlanGroup=({label,children}:{label:string;children:ReactNode})=><View style={s.group}><PlanText kind="overline">{label}</PlanText>{children}</View>;
export const PlanTile=({letter}:{letter:string})=><View style={s.tile}><Text style={[s.tileText,{fontFamily:monoFace('700')??mono}]}>{letter}</Text></View>;

const Option=({label,selected,onPress,segment}:{label:string;selected:boolean;onPress:()=>void;segment?:boolean})=>{
  const {reduced}=usePlanMotion();const opacity=useRef(new Animated.Value(selected?1:0)).current;
  useEffect(()=>{Animated.timing(opacity,{toValue:selected?1:0,duration:reduced?0:t.duration,useNativeDriver:true}).start();},[selected,reduced,opacity]);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected}} aria-selected={selected} onPress={onPress} style={[s.option,segment?s.segment:s.chip,selected&&s.selected]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,s.selectionFill,segment?s.segmentRadius:s.chipRadius,{opacity}]}/>
    <Text style={[s.optionText,segment&&s.segmentText,{fontFamily:segment?(monoFace(selected?'700':'400')??mono):headingFace()},selected&&s.selectedText]}>{label}</Text>
  </Pressable>;
};
export const PlanOptions=<T extends string|number,>({options,value,onChange,segments=false}:{options:readonly {value:T;label:string}[];value:T|readonly T[];onChange:(value:T)=>void;segments?:boolean})=><View style={segments?s.segments:s.chips}>{options.map(option=><Option key={option.value} label={option.label} segment={segments} selected={Array.isArray(value)?value.includes(option.value):value===option.value} onPress={()=>onChange(option.value)}/>)}</View>;
export const PlanButton=({label,onPress,variant='primary',disabled=false}:{label:string;onPress:()=>void;variant?:'primary'|'ghost'|'dashed';disabled?:boolean})=><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} aria-disabled={disabled} disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,variant==='primary'?s.primary:variant==='dashed'?s.dashed:s.ghost,disabled&&s.disabled,pressed&&s.pressed]}><Text style={[s.buttonText,{fontFamily:headingFace()},variant==='primary'?s.accent:variant==='ghost'?s.ghostText:s.dashedText]}>{variant==='dashed'?'＋ ':''}{label}</Text></Pressable>;
export const PlanFooter=({secondary,primary,onSecondary,onPrimary,disabled=false}:{secondary:string;primary:string;onSecondary:()=>void;onPrimary:()=>void;disabled?:boolean})=><View style={s.footer}><View style={s.secondarySlot}><PlanButton variant="ghost" label={secondary} onPress={onSecondary}/></View><View style={s.primarySlot}><PlanButton label={primary} onPress={onPrimary} disabled={disabled}/></View></View>;
export const PlanInput=(props:TextInputProps)=><TextInput {...props} placeholderTextColor={colors.textFaint} style={[s.input,{fontFamily:headingFace()},props.style]}/>;
export const PlanPanel=({title,summary,open,onToggle,leading,action,children}:{title:string;summary:string;open:boolean;onToggle:()=>void;leading?:ReactNode;action?:ReactNode;children:ReactNode})=><View style={[s.panel,open&&s.expanded]}>
  <View style={s.panelHead}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{expanded:open}} aria-expanded={open} onPress={onToggle} style={[s.row,s.panelToggle]}>
      {leading}<View style={s.copy}><PlanText bold>{title}</PlanText><PlanText kind="meta">{summary}</PlanText></View>{action?null:<Ionicons name={open?'chevron-up':'chevron-down'} size={t.icon} color={open?colors.accent:colors.textDim}/>}
    </Pressable>{action}
  </View>{open?<View style={s.panelBody}>{children}</View>:null}
</View>;
/** Small round "+" for adding into the section it sits in. */
export const PlanAdd=({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean})=><Pressable accessibilityRole="button" accessibilityLabel={label}
  disabled={disabled} onPress={onPress} hitSlop={8} style={({pressed})=>[s.add,disabled&&s.disabled,pressed&&s.pressed]}>
  <Ionicons name="add" size={20} color={colors.accent}/>
</Pressable>;
export const planStyles=StyleSheet.create({
  root:{gap:t.gap}, row:{flexDirection:'row',alignItems:'center',gap:t.pad.medium}, flex:{flex:1},
  content:{padding:t.gutter,gap:t.bodyGap}, section:{gap:t.gap}, header:{padding:t.gutter,flexDirection:'row',alignItems:'center',gap:t.pad.small},
  sheet:{flex:1,backgroundColor:colors.ground}, scroll:{flex:1}, count:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:t.bodyGap},
  muscleTile:{width:t.muscleTile,borderRadius:t.radius.tile,overflow:'hidden',backgroundColor:colors.tile},
  pickerRow:{backgroundColor:colors.surface,borderWidth:t.border,borderColor:colors.border,borderRadius:t.radius.row,padding:t.pad.medium,flexDirection:'row',alignItems:'center',gap:t.pad.medium,minHeight:t.touch},
  disabled:{opacity:t.disabled},note:{minHeight:t.button*2,textAlignVertical:'top'},
});
const s=StyleSheet.create({
  panelHead:{flexDirection:'row',alignItems:'center',paddingRight:t.pad.small},panelToggle:{flex:1},
  add:{width:36,height:36,borderRadius:18,alignItems:'center',justifyContent:'center',backgroundColor:colors.accentSoft,borderWidth:t.border,borderColor:colors.accentBorder},
  text:{fontSize:t.type.row,lineHeight:t.lineHeight.body,color:colors.text},title:{fontSize:t.type.title,lineHeight:t.lineHeight.title,fontWeight:'700'},meta:{fontSize:t.type.meta,lineHeight:t.lineHeight.meta,color:colors.textMuted},overline:{fontSize:t.type.overline,lineHeight:t.lineHeight.meta,letterSpacing:t.tracking.label,color:colors.textDim},bold:{fontWeight:'700'},accent:{color:colors.accent},success:{color:colors.success},muted:{color:colors.textMuted},
  group:{gap:t.gap},tileText:{fontSize:t.type.tile,fontWeight:'700',color:colors.accent},tile:{width:t.tile,height:t.tile,borderRadius:t.radius.tile,borderWidth:t.border,borderColor:colors.accentBorder,backgroundColor:colors.accentSoft,alignItems:'center',justifyContent:'center'},
  segments:{flexDirection:'row',gap:t.segmentGap},chips:{flexDirection:'row',flexWrap:'wrap',gap:t.chipGap},
  option:{minHeight:t.touch,alignItems:'center',justifyContent:'center',borderWidth:t.border,borderColor:colors.borderCard,backgroundColor:colors.surfaceInset,overflow:'hidden'},segment:{flex:1,paddingVertical:t.gap,borderRadius:t.radius.segment},chip:{paddingVertical:t.pad.small,paddingHorizontal:t.pad.field,borderRadius:t.radius.pill},optionText:{fontSize:t.type.chip,color:colors.textSecondary},segmentText:{fontSize:t.type.segment,color:colors.textMuted},selected:{borderColor:colors.accentBorder},selectedText:{color:colors.accent,fontWeight:'700'},selectionFill:{backgroundColor:colors.accentSoft},segmentRadius:{borderRadius:t.radius.segment},chipRadius:{borderRadius:t.radius.pill},
  button:{minHeight:t.button,borderRadius:t.radius.row,borderWidth:t.border,justifyContent:'center',alignItems:'center',paddingHorizontal:t.pad.small},buttonText:{fontSize:t.type.button,fontWeight:'700'},primary:{backgroundColor:colors.accentSoft,borderColor:colors.accentBorder},ghost:{borderColor:colors.borderCard},dashed:{borderColor:colors.borderStrong,borderStyle:'dashed'},ghostText:{fontSize:t.type.ghost,fontWeight:'600',color:colors.textMuted},dashedText:{fontSize:t.type.dashed,fontWeight:'600',color:colors.textMuted},disabled:{opacity:t.disabled},pressed:{opacity:t.pressed},
  footer:{flexDirection:'row',gap:t.pad.small,paddingHorizontal:t.gutter,paddingVertical:t.pad.medium},secondarySlot:{flex:1},primarySlot:{flex:t.primaryFlex},input:{minHeight:t.button,borderWidth:t.border,borderColor:colors.borderCard,borderRadius:t.radius.row,paddingVertical:t.pad.medium,paddingHorizontal:t.pad.field,backgroundColor:colors.surfaceInset,color:colors.text,fontSize:t.type.button},
  panel:{backgroundColor:colors.surface,borderWidth:t.border,borderColor:colors.border,borderRadius:t.radius.row,overflow:'hidden'},expanded:{borderColor:colors.borderStrong},row:{minHeight:t.touch,paddingVertical:t.pad.medium,paddingHorizontal:t.pad.row,flexDirection:'row',alignItems:'center',gap:t.pad.medium},copy:{flex:1,gap:t.pad.tiny},panelBody:{borderTopWidth:t.border,borderTopColor:colors.border,paddingTop:t.pad.field,paddingHorizontal:t.pad.row,paddingBottom:t.pad.body,gap:t.bodyGap},
});
