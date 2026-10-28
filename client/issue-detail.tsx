import { accessLost, readResult } from "./query-policy.ts";
import { useQueryPolicy } from "./query.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IssueForm, IssueStateAction } from "./issue-form.tsx";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IssueComments } from "./issue-comments.tsx";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { ExternalLink } from "@getpaseo/plugin/client/ui";
import { issueDetail, type IssueRef } from "../shared/issues.ts";
import { Action, InitialLoading, WorkbenchCard, workbenchStyles } from "./workbench-ui.tsx";
import { RichText } from "./description.tsx";
import { containDrawerFocus } from "./web.ts";
import { errorMessages } from "./errors.ts";

export function IssueDetail(props:PluginScreenProps&{reference:IssueRef;ready:boolean;onClose():void;onMilestones(params?:Record<string,string>):void}){
 const {reference,theme}=props,styles=workbenchStyles(theme),root=useRef<View>(null),rpc=useRpc(issueDetail);
 const cache=useQueryClient();
 useLayoutEffect(()=>props.layout.platform==="web"?containDrawerFocus(root.current,props.onClose):undefined,[props.layout.platform,props.onClose]);
 const detail=useQuery({ ...useQueryPolicy("detail"),queryKey:["issue",reference.siteUrl,reference.accountId,reference.projectId,reference.issueId],queryFn: () => readResult(rpc(reference)),retry:false,refetchOnWindowFocus:false});
 const issue=!(detail.isError&&accessLost(detail.error))&&detail.data?.ok?detail.data.issue:undefined;
 const [editing,setEditing]=useState<import("../shared/issues.ts").Issue>(),[actionRefresh,setActionRefresh]=useState(0);
 useEffect(()=>{
  if(detail.isError&&accessLost(detail.error)||detail.data&&!detail.data.ok&&accessLost(detail.data.error)){
   setEditing(undefined);
   const error=detail.data&&!detail.data.ok?detail.data.error:"";
   if(["account_changed","unauthorized","unconfigured"].includes(error))void cache.invalidateQueries({queryKey:["connection"]});
  }
 },[detail.isError,detail.data,cache]);
 return <View ref={root} style={styles.page}>
  <View style={{padding:16,gap:10,borderBottomWidth:1,borderColor:theme.colors.border}}>
   <View style={styles.toolbar}><Text style={[styles.muted,{flex:1}]}>{issue?`${issue.repositoryPath} · #${issue.iid}`:"议题详情"}</Text><Action theme={theme} label="刷新详情" icon="RefreshCw" disabled={detail.isFetching} onPress={()=>{void detail.refetch().then(result=>{if(result.isSuccess&&result.data?.ok)setActionRefresh(value=>value+1);});void cache.invalidateQueries({queryKey:["issue-notes",reference.siteUrl,reference.accountId,reference.projectId,reference.issueId]});}}/><Action theme={theme} label="关闭详情" icon="X" autoFocus={props.ready} onPress={props.onClose}/></View>
   {issue?<><Text accessibilityRole="header" style={styles.title}>{issue.title}</Text><Text style={styles.muted}>{issue.state==="closed"?"已关闭":issue.state==="opened"?"开放":issue.state} · @{issue.author?.username??"未知作者"}{issue.confidential?" · 🔒 私密议题":""}</Text><View style={styles.toolbar}><Action theme={theme} quiet icon="Pencil" label="编辑议题" disabled={detail.isFetching||issue.descriptionTruncated} onPress={()=>setEditing(issue)}/><IssueStateAction key={`${reference.projectId}:${reference.issueId}`} refreshId={actionRefresh} theme={theme} reference={reference} issue={issue} disabled={detail.isFetching}/><ExternalLink href={issue.url}><Text style={{...styles.text,color:theme.colors.accent}}>在工蜂查看 ↗</Text></ExternalLink></View></>:null}
  </View>
  <ScrollView contentContainerStyle={{padding:16,gap:16}}>
   {detail.isFetching&&!detail.data?<ActivityIndicator color={theme.colors.accent}/>:null}
   {detail.isError||detail.data&&!detail.data.ok?<Text style={styles.text}>{detail.data&&!detail.data.ok?errorMessages[detail.data.error]:"无法加载议题，请重试。"}</Text>:null}
   {issue?<>
    <WorkbenchCard theme={theme} title="议题信息" icon="CircleDot"><View style={{padding:12,gap:8}}>
     <Text style={styles.text}>处理人：{issue.assignees.map(u=>u.username).join(", ")||"未指派"}</Text>
     <Text style={styles.text}>优先级：{issue.priorityLabel||"未指定"} · 解决状态：{issue.resolveState??"未指定"}</Text>
     <Text style={styles.text}>标签：{issue.labels.join("、")||"无"}</Text>
     {issue.milestone?<Action theme={theme} quiet label={`里程碑：${issue.milestone.title}`} icon="Flag" onPress={()=>props.onMilestones({siteUrl:reference.siteUrl??"",accountId:String(reference.accountId),projectId:String(reference.projectId),milestoneId:String(issue.milestone!.id)})}/>:<Text style={styles.muted}>未关联里程碑</Text>}
     {issue.linkedIssues?<Text style={{...styles.text,color:theme.colors.statusWarning}}>包含 {issue.linkedIssues} 个关联议题；fork 关联的状态和评论可能由工蜂双向同步，请在原站核对关联。</Text>:null}
    </View></WorkbenchCard>
    <WorkbenchCard theme={theme} title="描述" icon="FileText"><View style={{padding:12}}><RichText source={issue.description} url={issue.url} theme={theme} emptyText="暂无描述。"/>{issue.descriptionTruncated?<Text style={styles.muted}>正文较长，仅显示部分，请在原站查看完整内容。</Text>:null}</View></WorkbenchCard>
    <IssueComments key={`${reference.siteUrl}:${reference.accountId}:${reference.projectId}:${reference.issueId}`} theme={theme} reference={reference} url={issue.url} linked={issue.linkedIssues>0} disabled={detail.isFetching}/>
    <Text style={styles.muted}>议题／评论删除尚无已确认的正式接口，本版本不提供删除操作。</Text>
   </>:null}
  </ScrollView>
  {detail.isPending&&detail.isFetching?<InitialLoading theme={theme} label="正在加载议题详情"/>:null}
  {editing?<IssueForm theme={theme} siteUrl={reference.siteUrl} accountId={reference.accountId} repositories={[{id:editing.projectId,path:editing.repositoryPath}]} initial={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{}}/>:null}
 </View>;
}
