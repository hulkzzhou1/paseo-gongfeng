import { useDraft } from "./draft-guard.tsx";
import { accessLost, invalidateResources } from "./query-policy.ts";
import { useQueryPolicy } from "./query.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { issueNotes, saveIssueNote, type IssueNote, type IssueRef } from "../shared/issues.ts";
import { Action, WorkbenchCard, workbenchStyles, type Theme } from "./workbench-ui.tsx";
import { RichText } from "./description.tsx";
import { widenDescriptionDialog } from "./web.ts";
import { errorMessages } from "./errors.ts";

export function IssueComments({theme,reference,url,linked,disabled}:{theme:Theme;reference:IssueRef;url:string;linked:boolean;disabled:boolean}){
 const styles=workbenchStyles(theme),cache=useQueryClient(),rpc=useRpc(issueNotes),[editing,setEditing]=useState<IssueNote|null|undefined>();
 const key=["issue-notes",reference.siteUrl,reference.accountId,reference.projectId,reference.issueId];
 const pages=useInfiniteQuery({ ...useQueryPolicy("detail"),queryKey:key,initialPageParam:1,queryFn:async({pageParam})=>{const r=await rpc({...reference,page:pageParam});if(!r.ok)throw Error(r.error);return r;},getNextPageParam:p=>p.nextPage??undefined,retry:false,refetchOnWindowFocus:false});
 useEffect(()=>{if(pages.isError&&accessLost(pages.error)){setEditing(undefined);if(["account_changed","unauthorized","unconfigured"].includes(pages.error.message))void cache.invalidateQueries({queryKey:["connection"]});}},[pages.isError,pages.error,cache]);
 const items=pages.isError&&accessLost(pages.error)?[]:[...new Map((pages.data?.pages.flatMap(p=>p.items)??[]).map(n=>[n.id,n])).values()];
 return <WorkbenchCard theme={theme} title={`评论 · ${items.length}${pages.hasNextPage?"+":""}`} icon="MessageSquare" right={<Action theme={theme} quiet label="发表评论" icon="Plus" disabled={disabled||pages.isError} onPress={()=>setEditing(null)}/>}>
  <View style={{padding:12,gap:12}}>
   {linked?<Text style={{...styles.text,color:theme.colors.statusWarning}}>fork 关联议题的评论可能由工蜂双向同步。</Text>:null}
   {pages.isPending?<Text style={styles.muted}>正在加载评论…</Text>:null}
   {pages.isError?<Text accessibilityLiveRegion="polite" style={styles.text}>{errorMessages[pages.error.message]??"评论读取失败，请刷新详情。"}</Text>:null}
   {items.map(note=><View key={note.id} style={[styles.panel,{padding:12,gap:10}]}>
    <View style={styles.toolbar}><Text style={[styles.muted,{flex:1}]}>{note.author?.username??"未知作者"} · {note.createdAt??""}{note.system?" · 系统记录":""}</Text>{!note.system&&!note.truncated&&note.author?.id===reference.accountId?<Action theme={theme} quiet label="编辑评论" icon="Pencil" disabled={disabled||pages.isFetching} onPress={()=>setEditing(note)}/>:null}</View>
    <RichText source={note.body} url={url} theme={theme}/>
    {note.truncated||note.nestedCount?<Text style={styles.muted}>{note.truncated?"评论已截断。":""}{note.nestedCount?`包含 ${note.nestedCount} 条嵌套记录；回复线程完整内容请在原站查看。`:""}</Text>:null}
   </View>)}
   {!items.length&&!pages.isPending&&!pages.isError?<Text style={styles.muted}>暂无评论。</Text>:null}
   {pages.hasNextPage?<Action theme={theme} label="加载更多评论" disabled={pages.isFetching} onPress={()=>{void pages.fetchNextPage();}}/>:null}
   {editing!==undefined?<NoteForm key={editing?.id??"new"} theme={theme} reference={reference} initial={editing} onClose={()=>setEditing(undefined)}/>:null}
  </View>
 </WorkbenchCard>;
}
function NoteForm({theme,reference,initial,onClose}:{theme:Theme;reference:IssueRef;initial:IssueNote|null;onClose():void}){
 const styles=workbenchStyles(theme),root=useRef<View>(null),cache=useQueryClient(),rpc=useRpc(saveIssueNote),[body,setBody]=useState(initial?.body??""),[notice,setNotice]=useState(""),[uncertain,setUncertain]=useState(false);
 useLayoutEffect(()=>widenDescriptionDialog(root.current),[]);
 const input={...reference,body,...(initial?{noteId:initial.id,revision:initial.revision}:{})};
 const mutation=useMutation({mutationFn:()=>rpc(input),retry:false,onSuccess(r){if(r.ok){void invalidateResources(cache,reference,["issue-notes","issue","issues"]);onClose();}else{if(["account_changed","unauthorized","unconfigured"].includes(r.error)){void cache.invalidateQueries({queryKey:["connection"]});onClose();return;}setNotice(errorMessages[r.error]??"无法保存评论。");setUncertain(r.error==="outcome_unknown");}},onError(){setUncertain(true);setNotice("评论结果不确定，请关闭并刷新核对，不要重复发表。");}});
  const requestClose=useDraft(body!==(initial?.body??""),mutation.isPending);
 return <Modal title={initial?"编辑我的评论":"发表评论"} open onOpenChange={open=>{if(!open&&!mutation.isPending)requestClose(onClose);}}><Modal.Content>
  <View ref={root} style={{gap:12}}>
   <TextInput autoFocus accessibilityLabel="议题评论正文" value={body} onChangeText={setBody} editable={!mutation.isPending} multiline maxLength={100000} style={{...styles.text,height:280,textAlignVertical:"top",padding:10,borderWidth:1,borderColor:theme.colors.border,borderRadius:6,backgroundColor:theme.colors.surface1}}/>
   {notice?<Text accessibilityLiveRegion="polite" style={styles.text}>{notice}</Text>:null}
   <View style={[styles.toolbar,{justifyContent:"flex-end"}]}><Action theme={theme} label="取消" disabled={mutation.isPending} onPress={()=>requestClose(onClose)}/><Action theme={theme} primary label={mutation.isPending?"提交中…":initial?"保存评论":"确认发表"} disabled={mutation.isPending||uncertain||!saveIssueNote.input.safeParse(input).success} onPress={()=>mutation.mutate()}/></View>
  </View>
 </Modal.Content></Modal>;
}
