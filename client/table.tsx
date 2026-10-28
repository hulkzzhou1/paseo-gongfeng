import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { workbenchStyles, type Theme } from './workbench-ui.tsx';
export type TableColumn<T>={key:string;title:string;width?:number;interactive?:boolean;render(row:T):ReactNode};
export function WorkbenchTable<T>({theme,compact,rows,columns,rowKey,label,onOpen,selected,empty}:{theme:Theme;compact:boolean;rows:T[];columns:TableColumn<T>[];rowKey(row:T):string;label(row:T):string;onOpen(row:T):void;selected?(row:T):boolean;empty?:string}) {
 const styles=workbenchStyles(theme),[focus,setFocus]=useState<string>();
 const cells=columns.filter(c=>!c.interactive),actions=columns.filter(c=>c.interactive);
 return <View testID="gongfeng-data-table" style={styles.panel}>
  {!compact?<View style={{flexDirection:'row',gap:10,backgroundColor:theme.colors.surface1,paddingHorizontal:12,borderBottomWidth:1,borderColor:theme.colors.border}}>{columns.map(c=><Text key={c.key} style={[styles.muted,{paddingVertical:8,fontWeight:'600',...(c.width?{width:c.width}:{flex:1,minWidth:0})}]}>{c.title}</Text>)}</View>:null}
  {rows.map(row=><View key={rowKey(row)} style={{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,borderBottomWidth:1,borderColor:theme.colors.border,borderLeftWidth:2,borderLeftColor:focus===rowKey(row)||selected?.(row)?theme.colors.accent:'transparent',backgroundColor:selected?.(row)?theme.colors.surface1:theme.colors.surface0}}>
   <Pressable accessibilityRole="button" accessibilityLabel={label(row)} onFocus={()=>setFocus(rowKey(row))} onBlur={()=>setFocus(undefined)} onPress={()=>onOpen(row)}
    style={({pressed})=>({flex:1,minWidth:0,paddingVertical:compact?12:9,gap:compact?5:10,flexDirection:compact?'column':'row',alignItems:compact?'stretch':'center',backgroundColor:pressed?theme.colors.surface1:'transparent'})}>
    {compact?<>
     <View style={{minWidth:0}}>{cells[0]?.render(row)}</View>
     <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{cells.slice(1).map(c=><View key={c.key} style={{maxWidth:'100%',flexDirection:'row',gap:4}}><Text style={styles.muted}>{c.title}</Text><View style={{flexShrink:1,minWidth:0}}>{c.render(row)}</View></View>)}</View>
    </>:cells.map(c=><View key={c.key} style={{...(c.width?{width:c.width}:{flex:1}),minWidth:0}}>{c.render(row)}</View>)}
   </Pressable>
   {actions.map(c=><View key={c.key} style={{width:compact?38:c.width,minHeight:38,justifyContent:'center'}}>{c.render(row)}</View>)}
  </View>)}
  {!rows.length&&empty?<Text style={[styles.muted,{padding:20}]}>{empty}</Text>:null}
 </View>;
}
