import { invalidateResources } from "./query-policy.ts";
import { useDraft } from "./draft-guard.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { saveIssue, type Issue, type IssueRef } from "../shared/issues.ts";
import { Action, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { RepositoryPicker } from "./repository-picker.tsx";
import { widenDescriptionDialog } from "./web.ts";
import { errorMessages } from "./errors.ts";
import { IssueFields, type IssueEdits } from "./issue-fields.tsx";

export function IssueForm({theme,siteUrl,accountId,repositories,initial,initialRepositoryId,onClose,onSaved}:{theme:Theme;siteUrl?:string;accountId:number;repositories:{id:number;path:string}[];initial:Issue|null;initialRepositoryId?:number;onClose():void;onSaved(issue:Issue):void}){
 const styles=workbenchStyles(theme),cache=useQueryClient(),rpc=useRpc(saveIssue),root=useRef<View>(null);
 useLayoutEffect(()=>widenDescriptionDialog(root.current),[]);
 const [projectId,setProjectId]=useState(initial?.projectId??initialRepositoryId??(repositories.length===1?repositories[0].id:undefined));
 const [title,setTitle]=useState(initial?.title??""),[description,setDescription]=useState(initial?.description??""),[confidential,setConfidential]=useState(initial?.confidential??false);
 const [confirmPublic,setConfirmPublic]=useState(false),[notice,setNotice]=useState(""),[uncertain,setUncertain]=useState(false);
 const [metadata,setMetadata]=useState<IssueEdits>({});
 const input={siteUrl,accountId,projectId:projectId!,title:title.trim(),description,confidential,...(initial?{issueId:initial.id,revision:initial.revision}:{}),...metadata};
 const valid=saveIssue.input.safeParse(input).success;
 const mutation=useMutation({mutationFn:(confirmed:boolean)=>rpc({...input,confirmPublic:confirmed}),retry:false,onSuccess(result){
  if(result.ok){void invalidateResources(cache,{siteUrl,accountId},["issue","issues","milestone","milestones"]);onSaved(result.issue);onClose();}
  else{if(["account_changed","unauthorized","unconfigured"].includes(result.error)){void cache.invalidateQueries({queryKey:["connection"]});onClose();return;}setNotice(errorMessages[result.error]??"无法保存议题。");setUncertain(result.error==="outcome_unknown");}
 },onError(){setUncertain(true);setNotice("保存结果不确定，请关闭并刷新核对，避免重复创建。");}});
  const requestClose=useDraft(title!==(initial?.title??"")||description!==(initial?.description??"")||confidential!==(initial?.confidential??false)||Object.keys(metadata).length>0||!initial&&projectId!==(initialRepositoryId??(repositories.length===1?repositories[0].id:undefined)),mutation.isPending);
 const busy=mutation.isPending,inputStyle={...styles.text,minHeight:38,borderWidth:1,borderColor:theme.colors.border,borderRadius:6,padding:9,backgroundColor:theme.colors.surface1};
 return <>
  <Modal title={initial?"编辑议题":"新建议题"} open onOpenChange={open=>{if(!open&&!busy)requestClose(onClose);}}><Modal.Content>
   <View ref={root} style={{gap:12}}>
    <Text style={styles.text}>仓库</Text>{initial?<Text style={styles.muted}>{initial.repositoryPath}</Text>:<RepositoryPicker theme={theme} items={repositories} value={projectId} onChange={id=>{setProjectId(id);setMetadata({});}}/>}
    <Text style={styles.text}>标题</Text><TextInput autoFocus accessibilityLabel="议题标题" value={title} maxLength={255} onChangeText={setTitle} editable={!busy} style={inputStyle}/>
    <Text style={styles.text}>描述（Markdown）</Text><TextInput accessibilityLabel="议题描述" value={description} multiline maxLength={100000} onChangeText={setDescription} editable={!busy} style={{...inputStyle,height:320,textAlignVertical:"top"}}/>
    <View style={styles.toolbar}><Text style={styles.text}>可见性</Text><Action theme={theme} pill label="普通" selected={!confidential} disabled={busy} onPress={()=>setConfidential(false)}/><Action theme={theme} pill label="私密" selected={confidential} disabled={busy} onPress={()=>setConfidential(true)}/></View>
    {projectId?<IssueFields key={projectId} theme={theme} scope={{siteUrl,accountId,projectId}} initial={initial} value={metadata} onChange={setMetadata} disabled={busy} onAccessLost={onClose}/>:null}
    {initial?.descriptionTruncated?<Text style={styles.text}>正文超出编辑范围，请在原站编辑，避免覆盖未加载内容。</Text>:null}
    {notice?<Text accessibilityLiveRegion="polite" style={{...styles.text,color:theme.colors.statusDanger}}>{notice}</Text>:null}
    <View style={[styles.toolbar,{justifyContent:"flex-end"}]}><Action theme={theme} label="取消" disabled={busy} onPress={()=>requestClose(onClose)}/><Action theme={theme} primary label={busy?"保存中…":"保存议题"} disabled={!valid||busy||uncertain||initial?.descriptionTruncated} onPress={()=>{setNotice("");if(initial?.confidential&&!confidential)setConfirmPublic(true);else mutation.mutate(false);}}/></View>
   </View>
  </Modal.Content></Modal>
  <Modal title="确认改为普通议题" open={confirmPublic} onOpenChange={open=>{if(!busy)setConfirmPublic(open);}}><Modal.Content>
   <Text style={styles.text}>将“{initial?.title}”改为普通后，可见范围可能扩大。确认保存此变更？</Text>
   <View style={[styles.toolbar,{justifyContent:"flex-end"}]}><Action theme={theme} label="取消" disabled={busy} onPress={()=>setConfirmPublic(false)}/><Action theme={theme} primary label="确认改为普通并保存" disabled={busy||uncertain} onPress={()=>mutation.mutate(true)}/></View>
   {notice?<Text style={styles.text}>{notice}</Text>:null}
  </Modal.Content></Modal>
 </>;
}

export function IssueStateAction({theme,reference,issue,disabled,refreshId}:{theme:Theme;reference:IssueRef;issue:Issue;disabled:boolean;refreshId:number}){
 const rpc=useRpc(saveIssue),cache=useQueryClient(),styles=workbenchStyles(theme),[open,setOpen]=useState(false),[uncertain,setUncertain]=useState(false),[notice,setNotice]=useState("");
 useEffect(()=>{setOpen(false);setUncertain(false);setNotice("");},[refreshId]);
 const event=issue.state==="closed"?"reopen":"close",label=event==="close"?"关闭议题":"重新打开";
 const mutation=useMutation({mutationFn:()=>rpc({...reference,revision:issue.revision,stateEvent:event}),retry:false,onSuccess(r){
  void invalidateResources(cache,reference,["issue","issues","milestone","milestones"]);
  if(r.ok)setOpen(false);else{setNotice(errorMessages[r.error]??"操作未完成，请刷新核对。");setUncertain(r.error==="outcome_unknown");}
 },onError(){setUncertain(true);setNotice("结果不确定，请关闭弹窗并刷新核对，避免重复写入。");}});
  useDraft(false,mutation.isPending);
 return <><Action theme={theme} quiet label={label} icon={event==="close"?"Check":"RotateCcw"} disabled={disabled||!["opened","closed"].includes(issue.state)} onPress={()=>{setOpen(true);setNotice("");}}/>
 <Modal title={label} open={open} onOpenChange={v=>{if(!mutation.isPending)setOpen(v);}}><Modal.Content>
  <Text style={styles.text}>确认{label}“{issue.title}”？{issue.linkedIssues?"fork 关联议题的状态可能由工蜂同步更新。":""}</Text>
  {notice?<Text style={styles.text}>{notice}</Text>:null}
  <View style={[styles.toolbar,{justifyContent:"flex-end"}]}><Action theme={theme} label="取消" disabled={mutation.isPending} onPress={()=>setOpen(false)}/><Action theme={theme} primary label={mutation.isPending?"提交中…":"确认"} disabled={mutation.isPending||uncertain} onPress={()=>mutation.mutate()}/></View>
 </Modal.Content></Modal></>;
}
