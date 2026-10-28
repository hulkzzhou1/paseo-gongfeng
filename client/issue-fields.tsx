import { useQueryPolicy } from "./query.tsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { issueMembers, issueLabels, issueMilestones, type Issue } from "../shared/issues.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { containDrawerFocus } from "./web.ts";
import { errorMessages } from "./errors.ts";

export type IssueEdits={assigneeIds?:number[];labels?:string[];milestoneId?:number|null;priority?:number;resolveState?:"accepted"|"resolved"|"denied"};
type Option={value:string;label:string};
function Choices({theme,label,items,selected,onChange,onSearch,onMore,error,loading,single=false,disabled=false}:{theme:Theme;label:string;items:Option[];selected:string[];onChange(v:string[]):void;onSearch?(v:string):void;onMore?():void;error?:string;loading:boolean;single?:boolean;disabled?:boolean}){
 const styles=workbenchStyles(theme),root=useRef<View>(null),trigger=useRef<View>(null),popup=useRef<View>(null),{height}=useWindowDimensions();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[above,setAbove]=useState(false);
 const close=useCallback(()=>{setOpen(false);trigger.current?.focus();},[]);
 useEffect(()=>open?containDrawerFocus(popup.current,close):undefined,[open,close]);
 const choose=(value:string)=>{onChange(single?[value]:selected.includes(value)?selected.filter(v=>v!==value):selected.length<10?[...selected,value]:selected);if(single)close();};
 return <View ref={root} style={{gap:5,position:"relative",zIndex:open?30:1}}>
  <Text style={styles.text}>{label}</Text>
  <Pressable ref={trigger} accessibilityRole="combobox" accessibilityLabel={label} accessibilityState={{expanded:open,disabled}} disabled={disabled} onPress={()=>root.current?.measureInWindow((_x,y,_w,h)=>{setAbove(height-y-h<260&&y>260);setOpen(v=>!v);})} style={{padding:9,minHeight:38,borderWidth:1,borderColor:open?theme.colors.accent:theme.colors.border,borderRadius:6}}><Text numberOfLines={2} style={styles.text}>{selected.length?selected.map(v=>items.find(i=>i.value===v)?.label??v).join("、"):`选择${label}`} ▾</Text></Pressable>
  {open?<View ref={popup} style={[styles.panel,{position:"absolute",...(above?{bottom:46}:{top:66}),left:0,right:0,padding:6,zIndex:40,shadowColor:theme.colors.foreground,shadowOpacity:.15,shadowRadius:10,elevation:10}]}>
   <TextInput autoFocus accessibilityLabel={`搜索${label}`} placeholder="在下拉框中搜索…" placeholderTextColor={theme.colors.foregroundMuted} value={query} onChangeText={v=>{setQuery(v);onSearch?.(v);}} style={{...styles.text,minHeight:38,padding:8,borderWidth:1,borderColor:theme.colors.border,borderRadius:4}}/>
   <ScrollView style={{maxHeight:200}} keyboardShouldPersistTaps="handled">
    {!single?<Action theme={theme} quiet label="清空选择" disabled={disabled} onPress={()=>onChange([])}/>:null}
    {items.filter(i=>i.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(i=><Action key={i.value} theme={theme} quiet label={`${selected.includes(i.value)?"✓ ":""}${i.label}`} disabled={disabled||!single&&!selected.includes(i.value)&&selected.length>=10} onPress={()=>choose(i.value)}/>)}
    {loading?<Text style={styles.muted}>正在加载…</Text>:null}{error?<Text style={styles.text}>{errorMessages[error]??"候选加载失败"}</Text>:null}
    {onMore?<Action theme={theme} quiet label="加载更多候选" disabled={loading} onPress={onMore}/>:null}
   </ScrollView>
   <Action theme={theme} quiet label="收起选项" onPress={close}/>
  </View>:null}
 </View>;
}
export function IssueFields({theme,scope,initial,value,onChange,disabled,onAccessLost}:{theme:Theme;scope:{siteUrl?:string;accountId:number;projectId:number};initial:Issue|null;value:IssueEdits;onChange(v:IssueEdits):void;disabled:boolean;onAccessLost():void}){
 const cache=useQueryClient();
 const membersRpc=useRpc(issueMembers),labelsRpc=useRpc(issueLabels),milestonesRpc=useRpc(issueMilestones),[search,setSearch]=useState(""),[query,setQuery]=useState("");
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(timer);},[search]);
 const key=["issue-candidates",scope.siteUrl,scope.accountId,scope.projectId];
 const members=useInfiniteQuery({ ...useQueryPolicy("options"),queryKey:[...key,"members",query],initialPageParam:1,queryFn:async({pageParam})=>{const r=await membersRpc({...scope,page:pageParam,query});if(!r.ok)throw Error(r.error);return r;},getNextPageParam:p=>p.nextPage??undefined,retry:false});
 const labels=useInfiniteQuery({ ...useQueryPolicy("options"),queryKey:[...key,"labels"],initialPageParam:1,queryFn:async({pageParam})=>{const r=await labelsRpc({...scope,page:pageParam});if(!r.ok)throw Error(r.error);return r;},getNextPageParam:p=>p.nextPage??undefined,retry:false});
 const milestones=useInfiniteQuery({ ...useQueryPolicy("options"),queryKey:[...key,"milestones"],initialPageParam:1,queryFn:async({pageParam})=>{const r=await milestonesRpc({...scope,page:pageParam});if(!r.ok)throw Error(r.error);return r;},getNextPageParam:p=>p.nextPage??undefined,retry:false});
 const accessError=[members.error?.message,labels.error?.message,milestones.error?.message].find(error=>error&&["account_changed","unauthorized","unconfigured"].includes(error));
 useEffect(()=>{if(accessError){onAccessLost();void cache.invalidateQueries({queryKey:["connection"]});}},[accessError,onAccessLost,cache]);
 const people=[...new Map([...(initial?.assignees??[]),...(!members.isError?members.data?.pages.flatMap(p=>p.items)??[]:[])].map(u=>[u.id,u])).values()];
 const labelNames=[...new Set([...(initial?.labels??[]),...(!labels.isError?labels.data?.pages.flatMap(p=>p.items)??[]:[])])];
 const milestoneRows=[...new Map([...(initial?.milestone?[initial.milestone]:[]),...(!milestones.isError?milestones.data?.pages.flatMap(p=>p.items)??[]:[])].map(m=>[m.id,m])).values()];
 const milestoneId=value.milestoneId===undefined?initial?.milestone?.id:value.milestoneId;
 return <View style={{gap:12}}>
  <Choices theme={theme} label="处理人（最多10人）" items={people.map(u=>({value:String(u.id),label:`${u.username} (${u.name})`}))} selected={(value.assigneeIds??initial?.assignees.map(u=>u.id)??[]).map(String)} onChange={v=>onChange({...value,assigneeIds:v.map(Number)})} onSearch={setSearch} onMore={members.hasNextPage?()=>{void members.fetchNextPage();}:undefined} loading={members.isFetching} error={members.error?.message} disabled={disabled}/>
  <Choices theme={theme} label="已有标签（最多10个）" items={labelNames.map(t=>({value:t,label:t}))} selected={value.labels??initial?.labels??[]} onChange={v=>onChange({...value,labels:v})} onMore={labels.hasNextPage?()=>{void labels.fetchNextPage();}:undefined} loading={labels.isFetching} error={labels.error?.message} disabled={disabled}/>
  <Choices theme={theme} label="里程碑" single items={[{value:"none",label:"不关联里程碑"},...milestoneRows.map(m=>({value:String(m.id),label:m.title}))]} selected={[milestoneId?String(milestoneId):"none"]} onChange={v=>onChange({...value,milestoneId:v[0]==="none"?null:Number(v[0])})} onMore={milestones.hasNextPage?()=>{void milestones.fetchNextPage();}:undefined} loading={milestones.isFetching} error={milestones.error?.message} disabled={disabled}/>
  <SettingsSelect label="优先级" value={value.priority===undefined?"keep":String(value.priority)} options={[{value:"keep",label:initial?.priorityLabel?`保持 ${initial.priorityLabel}`:"保持默认"},...[0,1,2,3,4,5].map(p=>({value:String(p),label:`P${p}`}))]} disabled={disabled} onValueChange={v=>onChange({...value,priority:v==="keep"?undefined:Number(v)})}/>
  <SettingsSelect label="解决状态（与开放／关闭独立）" value={value.resolveState??"keep"} options={[{value:"keep",label:initial?.resolveState?`保持 ${initial.resolveState}`:"保持默认"},{value:"accepted",label:"已接受"},{value:"resolved",label:"已解决"},{value:"denied",label:"已拒绝"}]} disabled={disabled} onValueChange={v=>onChange({...value,resolveState:v==="keep"?undefined:v as IssueEdits["resolveState"]})}/>
 </View>;
}
