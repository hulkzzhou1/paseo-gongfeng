import { useConnection } from "./site.ts";
import { useDiscard } from "./draft-guard.tsx";
import { useViewState, useListScroll } from "./query.tsx";
import { WorkbenchTable } from "./table.tsx";
import { repositoryVersion, refreshFirstPage, accessLost, readResult } from "./query-policy.ts";
import { useQueryPolicy } from "./query.tsx";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/react-native";
import { issuesPage, type IssueRef } from "../shared/issues.ts";
import { IssueForm } from "./issue-form.tsx";
import { listManagedRepositories } from "../shared/repositories.ts";
import { Action, WorkbenchHeader, RefreshNotice, WorkbenchNavigation, workbenchStyles } from "./workbench-ui.tsx";
import { RepositoryPicker } from "./repository-picker.tsx";
import { ConnectionSettings } from "./connection.tsx";
import { Drawer } from "./drawer.tsx";
import { IssueDetail } from "./issue-detail.tsx";
import { richExcerpt } from "./rich-text.ts";
import { errorMessages } from "./errors.ts";

type Props = PluginScreenProps & { onMergeRequests(): void; onMilestones(params?:Record<string,string>): void; onManageRepositories(): void };
export function Issues(props: Props) {
 const active=useConnection();
 return <IssueBoard {...props} key={`${active?.siteUrl}:${active?.account.id}`} siteUrl={active?.siteUrl} accountId={active?.account.id}/>;
}
function IssueBoard(props:Props&{siteUrl?:string;accountId?:number}) {
 const discard=useDiscard();
 const {theme,layout,siteUrl,accountId}=props,styles=workbenchStyles(theme),cache=useQueryClient();
 const [state,setState]=useViewState<"opened"|"closed"|"all">(["view",siteUrl,accountId,"issues-state"],"opened"),[relation,setRelation]=useViewState<"all"|"created"|"assigned">(["view",siteUrl,accountId,"issues-relation"],"all");
 const [repositoryId,setRepositoryId]=useViewState<number|undefined>(["view",siteUrl,accountId,"issues-repository"],undefined),[draft,setDraft]=useViewState(["view",siteUrl,accountId,"issues-search"],""),[query,setQuery]=useState(draft.trim());
 const [selected,setSelected]=useState<IssueRef>(),[settings,setSettings]=useState(false),[width,setWidth]=useState(0);
 const [creating,setCreating]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(draft.trim()),300);return()=>clearTimeout(timer);},[draft]);
 useEffect(()=>{
  if(accountId&&props.params.siteUrl===siteUrl&&Number(props.params.accountId)===accountId&&Number(props.params.projectId)>0&&Number(props.params.issueId)>0)setSelected({siteUrl,accountId,projectId:Number(props.params.projectId),issueId:Number(props.params.issueId)});
  else setSelected(undefined);
 },[props.params.siteUrl,props.params.accountId,props.params.projectId,props.params.issueId,siteUrl,accountId]);
 const managedRpc=useRpc(listManagedRepositories),pageRpc=useRpc(issuesPage);
 const managed=useQuery({ ...useQueryPolicy("options"),queryKey:["managed-repositories",siteUrl,accountId],queryFn: () => readResult(managedRpc({siteUrl})),enabled:!!accountId,retry:false});
 const repositories=!(managed.isError&&accessLost(managed.error))&&managed.data?.ok?managed.data.items:[];
 const pages=useInfiniteQuery({ ...useQueryPolicy("list",!selected),queryKey:["issues",siteUrl,accountId,repositoryId,state,relation,query,repositoryVersion(repositories)],initialPageParam:undefined as {projectId:number;page:number}[]|undefined,
  queryFn:async({pageParam})=>{const r=await pageRpc({siteUrl,accountId:accountId!,repositoryId,state,relation,query,cursors:pageParam});if(!r.ok)throw Error(r.error);return r;},
  getNextPageParam:p=>p.next.length?p.next:undefined,enabled:!!accountId&&managed.data?.ok===true,retry:false,refetchOnWindowFocus:false});
 const failures=[...new Map((pages.data?.pages.flatMap(p=>p.failures)??[]).map(f=>[f.projectId,f])).values()];
 const failedRepositories=new Set(failures.filter(f=>accessLost(f.error)).map(f=>f.projectId));
 const rows=(pages.isError&&accessLost(pages.error))||(managed.isError&&accessLost(managed.error))?[]:[...new Map((pages.data?.pages.flatMap(p=>p.items).filter(i=>!failedRepositories.has(i.projectId))??[]).map(i=>[`${i.projectId}:${i.id}`,i])).values()].sort((a,b)=>(b.updatedAt??"").localeCompare(a.updatedAt??""));
 useEffect(()=>{
  if(pages.isError&&accessLost(pages.error)){setSelected(undefined);setCreating(false);if(["account_changed","unauthorized","unconfigured"].includes(pages.error.message))void cache.invalidateQueries({queryKey:["connection"]});}
 },[pages.isError,pages.error,cache]);
 const compact=layout.compact||width<650,close=useCallback(()=>setSelected(undefined),[]);
 const key=["issues",siteUrl,accountId,repositoryId,state,relation,query,repositoryVersion(repositories)];
 const [listScroll,resetScroll]=useListScroll(["view",siteUrl,accountId,"issues-scroll",state,relation,repositoryId,query]);
 const refresh=async()=>{
  resetScroll();
  if(managed.isError||!managed.data?.ok){
   const result=await managed.refetch();if(result.isError||!result.data?.ok)return;
   const target=repositoryId!==undefined&&result.data.items.some(r=>r.id===repositoryId)?repositoryId:undefined;
   if(target!==repositoryId)setRepositoryId(target);
   await refreshFirstPage(cache,["issues",siteUrl,accountId,target,state,relation,query,repositoryVersion(result.data.items)]);
  }else await refreshFirstPage(cache,key);
 };
 return <View testID="gongfeng-issues" style={styles.page} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
  <View style={styles.page} pointerEvents={selected?"none":"auto"} accessibilityElementsHidden={!!selected} importantForAccessibility={selected?"no-hide-descendants":"auto"}>
   <WorkbenchHeader theme={theme} compact={compact} busy={pages.isFetching||managed.isFetching} updatedAt={pages.dataUpdatedAt} error={pages.isError} onSettings={()=>setSettings(true)} onRefresh={refresh}>
    <Action theme={theme} dense={!compact} label="新建议题" icon="Plus" disabled={!accountId||!repositories.length} onPress={()=>setCreating(true)}/>
   </WorkbenchHeader>
   <WorkbenchNavigation theme={theme} compact={compact} selected="issues" siteUrl={siteUrl} onMergeRequests={props.onMergeRequests} onMilestones={()=>props.onMilestones()} onRepositories={props.onManageRepositories} onIssues={()=>{}}/>
   <View style={[styles.toolbar,{padding:12,zIndex:2}]}>
    {([["all","全部"],["created","我创建"],["assigned","指派给我"]]as const).map(([v,label])=><Action key={v} theme={theme} dense={!compact} pill label={label} selected={relation===v} onPress={()=>setRelation(v)}/>)}
    {([["opened","开放"],["closed","已关闭"],["all","全部状态"]]as const).map(([v,label])=><Action key={v} theme={theme} dense={!compact} quiet label={label} selected={state===v} onPress={()=>setState(v)}/>)}
    <RepositoryPicker theme={theme} items={repositories} value={repositoryId} onChange={setRepositoryId} allowAll/>
    <TextInput accessibilityLabel="搜索议题" placeholder="关键词或 #编号…" placeholderTextColor={theme.colors.foregroundMuted} value={draft} onChangeText={setDraft} style={{...styles.text,flex:1,minWidth:180,minHeight:compact?40:30,paddingHorizontal:10,borderWidth:1,borderColor:theme.colors.border,borderRadius:6}}/>
   </View>
   <View style={{flex:1,position:"relative"}}>
    <ScrollView {...listScroll} contentContainerStyle={{padding:12,gap:10}}>
     {!accountId?<Text style={styles.text}>请先在工蜂设置中连接账号。</Text>:null}
     {managed.isError||managed.data&&!managed.data.ok?<Text style={styles.text}>无法读取已添加仓库，请刷新重试。</Text>:null}
     {pages.isError?<Text accessibilityLiveRegion="polite" style={styles.text}>{errorMessages[pages.error.message]??"议题加载失败。"}</Text>:null}
     <Text style={styles.muted}>已加载 {rows.length} 项 · {repositoryId?"所选仓库":`${repositories.length} 个已添加仓库`} · 按已加载结果最近更新排序{pages.hasNextPage?" · 仍有未加载数据":""}{query?" · 关键词使用工蜂接口搜索，以已查询页为准":""}</Text>
     {failures.map(f=><Text key={f.projectId} style={styles.text}>{repositories.find(r=>r.id===f.projectId)?.path??f.projectId}：{errorMessages[f.error]??"加载失败"}</Text>)}
     <RefreshNotice theme={theme} pages={pages.data?.pages.length??0} busy={pages.isFetching||managed.isFetching} updatedAt={pages.dataUpdatedAt}/>
     <WorkbenchTable theme={theme} compact={compact} rows={rows} rowKey={i=>`${i.projectId}:${i.id}`} label={i=>`查看议题 ${i.repositoryPath} #${i.iid}`} onOpen={i=>setSelected({siteUrl,accountId:accountId!,projectId:i.projectId,issueId:i.id})} columns={[
      {key:"title",title:"议题",render:i=><View><Text numberOfLines={2} style={[styles.text,{fontWeight:"600"}]}>{i.confidential?"🔒 ":""}{i.title} <Text style={styles.muted}>#{i.iid}</Text></Text>{i.description?<Text numberOfLines={1} style={styles.muted}>{richExcerpt(i.description)}</Text>:null}</View>},
      {key:"repository",title:"仓库",width:175,render:i=><Text numberOfLines={1} style={styles.muted}>{i.repositoryPath}</Text>},
      {key:"state",title:"状态",width:60,render:i=><Text style={styles.muted}>{i.state==="closed"?"已关闭":"开放"}</Text>},
      {key:"people",title:"处理人",width:110,render:i=><Text numberOfLines={1} style={styles.muted}>{i.assignees.map(u=>u.username).join(", ")||"未指派"}</Text>},
      {key:"updated",title:"最近更新",width:100,render:i=><Text numberOfLines={1} style={styles.muted}>{i.updatedAt?new Date(i.updatedAt).toLocaleDateString():"—"}</Text>}
     ]} empty={pages.isPending?"正在加载议题…":pages.isError?"暂时无法显示议题。":pages.hasNextPage?"当前已加载范围没有匹配项，可继续加载。":"暂无符合条件的议题。"}/>
     {pages.hasNextPage?<Action theme={theme} label={pages.isFetchingNextPage?"加载中…":"加载更多议题"} disabled={pages.isFetching} onPress={()=>{void pages.fetchNextPage();}}/>:null}
    </ScrollView>
    {pages.isFetching&&!pages.data?<View pointerEvents="none" style={{position:"absolute",inset:0,alignItems:"center",justifyContent:"center",backgroundColor:theme.colors.surface0,opacity:0.9}}><ActivityIndicator color={theme.colors.accent}/></View>:null}
   </View>
  </View>
  {selected?<Drawer label="议题详情" theme={theme} width={compact?width:Math.min(width*0.8,1040)} onDismiss={close}>{(dismiss,ready)=><IssueDetail {...props} reference={selected} ready={ready} onClose={dismiss}/>}</Drawer>:null}
  <Modal title="工蜂配置" open={settings} onOpenChange={open=>{if(open)setSettings(true);else discard(()=>setSettings(false));}}><Modal.Content>{settings?<ConnectionSettings {...props}/>:null}</Modal.Content></Modal>
  {creating&&accountId?<IssueForm theme={theme} siteUrl={siteUrl} accountId={accountId} repositories={repositories} initial={null} initialRepositoryId={repositoryId} onClose={()=>setCreating(false)} onSaved={i=>setSelected({siteUrl,accountId,projectId:i.projectId,issueId:i.id})}/>:null}
 </View>;
}
