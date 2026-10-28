import { createHash } from "node:crypto";
import { z } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { issuesPage, issueDetail, saveIssue, issueMembers, issueLabels, issueMilestones, issueNotes, saveIssueNote, type Issue, type IssueNote } from "../shared/issues.ts";
import type { GongfengClient } from "./gongfeng.ts";
import type { registerRepositories } from "./repositories.ts";
import { avatarUrl } from "./avatar.ts";

const user = z.object({ id: z.number().int().positive(), username: z.string(), name: z.string(), avatar_url: z.string().nullish() });
const rawIssue = z.object({ id: z.number().int().positive(), iid: z.number().int().positive(), project_id: z.number().int().positive(), title: z.string(), description: z.string().nullish(), state: z.string(), confidential: z.boolean(), author: user.nullish(), assignees: z.array(user).nullish(), assignee: user.nullish(), labels: z.array(z.string()).default([]), milestone: z.object({ id: z.number().int().positive(), title: z.string() }).nullish(), priority: z.union([z.string(), z.number()]).nullish(), resolve_state: z.string().nullish(), updated_at: z.string().nullish(), created_at: z.string().nullish(), linkedIssues: z.array(z.unknown()).optional(), linked_issues: z.array(z.unknown()).optional() });
const invalid = { ok: false as const, error: "invalid_response" as const };
const rawNote=z.object({id:z.number().int().positive(),body:z.string(),author:user.nullish(),system:z.boolean().optional(),created_at:z.string().nullish(),updated_at:z.string().nullish(),comments:z.array(z.unknown()).optional()});
function normalizeNote(data:z.infer<typeof rawNote>,site:string):IssueNote{
 return {id:data.id,body:data.body.slice(0,100000),truncated:data.body.length>100000,author:data.author?{id:data.author.id,name:data.author.name,username:data.author.username,avatarUrl:avatarUrl(data.author.avatar_url,site)}:null,system:data.system!==false,createdAt:data.created_at??null,revision:createHash("sha256").update(JSON.stringify(data)).digest("hex"),nestedCount:data.comments?.length??0};
}
function normalize(data: z.infer<typeof rawIssue>, path: string, site: string): Issue {
 const person = (u: z.infer<typeof user>) => ({ id: u.id, name: u.name, username: u.username, avatarUrl: avatarUrl(u.avatar_url, site) });
 const match = /^P?([0-5])(?::.*)?$/i.exec(String(data.priority ?? ""));
 return { id: data.id, iid: data.iid, projectId: data.project_id, repositoryPath: path, title: data.title, description: (data.description ?? "").slice(0,100000), descriptionTruncated: (data.description?.length ?? 0)>100000, state: data.state === "reopened" ? "opened" : data.state, confidential: data.confidential, author: data.author ? person(data.author) : null, assignees: (data.assignees ?? (data.assignee ? [data.assignee] : [])).map(person), labels: data.labels, milestone: data.milestone ?? null, priority: match ? Number(match[1]) : null, priorityLabel: String(data.priority ?? ""), resolveState: data.resolve_state ?? null, updatedAt: data.updated_at ?? null, createdAt: data.created_at ?? null, linkedIssues: (data.linkedIssues ?? data.linked_issues ?? []).length, revision: createHash("sha256").update(JSON.stringify(data)).digest("hex"), url: `${site}/${path.split("/").map(encodeURIComponent).join("/")}/issues/${data.iid}` };
}
function nextPage(headers: Headers, count: number, page: number): number | null {
 const header=headers.get("x-next-page");
 const next=header===""?null:header===null?count>=20?page+1:null:Number(header);
 if(next!==null&&(!Number.isSafeInteger(next)||next<=page||next>10000))throw Error("Invalid pagination");
 return next;
}
export function registerIssues(server: Pick<PluginServerContext,"handle">, api: GongfengClient, repositories: ReturnType<typeof registerRepositories>) {
 async function access(input:{siteUrl?:string;accountId:number;projectId?:number}) {
  const session=await api.session(input.siteUrl);if(!session.ok)return session;
  if(session.account.id!==input.accountId)return {ok:false as const,error:"account_changed" as const};
  const managed=await repositories.managed({siteUrl:session.siteUrl});if(!managed.ok)return managed;
  if(input.projectId!==undefined&&!managed.items.some(r=>r.id===input.projectId))return {ok:false as const,error:"stale_binding" as const};
  return {ok:true as const,session,repositories:managed.items};
 }
 server.handle(issuesPage,async input=>{
  const scope=await access(input);if(!scope.ok)return scope;
  const selected=scope.repositories.filter(r=>input.repositoryId===undefined||r.id===input.repositoryId);
  if(input.repositoryId!==undefined&&!selected.length)return {ok:false as const,error:"stale_binding" as const};
  const cursors=input.cursors??selected.map(r=>({projectId:r.id,page:1}));
  if(new Set(cursors.map(c=>c.projectId)).size!==cursors.length||cursors.some(c=>!selected.some(r=>r.id===c.projectId)))return invalid;
  const results=await Promise.all(cursors.slice(0,4).map(async cursor=>{
   const query:Record<string,string>={page:String(cursor.page),per_page:"20",order_by:"updated_at",sort:"desc"};
   if(input.state!=="all")query.state=input.state;
   if(input.relation==="created")query.author_id=String(input.accountId);
   if(input.relation==="assigned")query.assignee_id=String(input.accountId);
   if(input.query)query[/^#?[1-9]\d*$/.test(input.query)?"iid":"search"]=input.query.replace(/^#(?=\d+$)/,"");
   const response=await scope.session.get(`/projects/${cursor.projectId}/issues`,query);if(!response.ok)return {...cursor,...response};
   const rows=z.array(rawIssue).safeParse(response.data);if(!rows.success||rows.data.some(r=>r.project_id!==cursor.projectId))return {...cursor,...invalid};
   try{
    const items=rows.data.map(r=>normalize(r,selected.find(p=>p.id===cursor.projectId)!.path,scope.session.siteUrl)).filter(r=>(input.state==="all"||r.state===input.state)&&(input.relation!=="created"||r.author?.id===input.accountId)&&(input.relation!=="assigned"||r.assignees.some(u=>u.id===input.accountId)));
    return {...cursor,ok:true as const,items,next:nextPage(response.headers,rows.data.length,cursor.page)};
   }catch{return {...cursor,...invalid};}
  }));
  return {ok:true as const,repositoryCount:selected.length,items:results.flatMap(r=>r.ok?r.items:[]),next:[...cursors.slice(4),...results.flatMap(r=>r.ok&&r.next?[{projectId:r.projectId,page:r.next}]:[])],failures:results.flatMap(r=>r.ok?[]:[{projectId:r.projectId,error:r.error}])};
 });
 async function read(input:{siteUrl?:string;accountId:number;projectId:number;issueId:number}) {
  const scope=await access(input);if(!scope.ok)return scope;
  const result=await scope.session.get(`/projects/${input.projectId}/issues/${input.issueId}`);if(!result.ok)return result;
  const row=rawIssue.safeParse(result.data);if(!row.success||row.data.id!==input.issueId||row.data.project_id!==input.projectId)return invalid;
  return {ok:true as const,issue:normalize(row.data,scope.repositories.find(r=>r.id===input.projectId)!.path,scope.session.siteUrl)};
 }
 server.handle(issueDetail,read);
 async function members(input:{siteUrl?:string;accountId:number;projectId:number;page:number;query?:string}){
  const scope=await access(input);if(!scope.ok)return scope;
  const result=await scope.session.get(`/projects/${input.projectId}/members/all`,{page:String(input.page),per_page:"20",...(input.query?{query:input.query}:{})});if(!result.ok)return result;
  const parsed=z.array(user.extend({state:z.string()})).safeParse(result.data);if(!parsed.success)return invalid;
  try{return {ok:true as const,items:parsed.data.filter(u=>u.state==="active").map(u=>({id:u.id,name:u.name,username:u.username,avatarUrl:avatarUrl(u.avatar_url,scope.session.siteUrl)})),nextPage:nextPage(result.headers,parsed.data.length,input.page)};}catch{return invalid;}
 }
 server.handle(issueMembers,members);
 async function labels(input:{siteUrl?:string;accountId:number;projectId:number;page:number}){
  const scope=await access(input);if(!scope.ok)return scope;
  const result=await scope.session.get(`/projects/${input.projectId}/labels`,{page:String(input.page),per_page:"20"});if(!result.ok)return result;
  const parsed=z.array(z.object({name:z.string()})).safeParse(result.data);if(!parsed.success)return invalid;
  try{return {ok:true as const,items:parsed.data.map(t=>t.name),nextPage:nextPage(result.headers,parsed.data.length,input.page)};}catch{return invalid;}
 }
 server.handle(issueLabels,labels);
 server.handle(issueMilestones,async input=>{
  const scope=await access(input);if(!scope.ok)return scope;
  const result=await scope.session.get(`/projects/${input.projectId}/milestones`,{page:String(input.page),per_page:"20",order_by:"updated_at",sort:"desc"});if(!result.ok)return result;
  const parsed=z.array(z.object({id:z.number().int().positive(),project_id:z.number().int().positive(),title:z.string(),state:z.string()})).safeParse(result.data);if(!parsed.success||parsed.data.some(m=>m.project_id!==input.projectId))return invalid;
  try{return {ok:true as const,items:parsed.data.map(({id,title,state})=>({id,title,state})),nextPage:nextPage(result.headers,parsed.data.length,input.page)};}catch{return invalid;}
 });
 server.handle(saveIssue,input=>api.exclusive(async()=>{
  const scope=await access(input);if(!scope.ok)return scope;
  let previous:Issue|undefined;
  if(input.issueId){
   const before=await read({...input,issueId:input.issueId});if(!before.ok)return before;
   previous=before.issue;
   if(before.issue.revision!==input.revision)return {ok:false as const,error:"stale_issue" as const};
   if(before.issue.confidential&&input.confidential===false&&!input.confirmPublic)return {ok:false as const,error:"confirmation_required" as const};
   if(before.issue.descriptionTruncated&&input.description!==undefined)return invalid;
   if(input.stateEvent&&before.issue.state!==(input.stateEvent==="close"?"opened":"closed"))return {ok:false as const,error:"stale_issue" as const};
  }
  if(input.assigneeIds?.length){
   const missing=new Set(input.assigneeIds);
   // shortcut: verify at most 2000 active repository members; expand when a larger repository needs it.
   for(let page:number|null=1,count=0;missing.size&&page!==null&&count<100;count++){
    const result=await members({...input,page});if(!result.ok)return result;
    for(const member of result.items)missing.delete(member.id);page=result.nextPage;
   }
   if(missing.size)return invalid;
  }
  if(input.labels?.length){
   const missing=new Set(input.labels.filter(label=>!previous?.labels.includes(label)));
   // shortcut: limit candidate verification to 2000 labels; expand for a real larger repository.
   for(let page:number|null=1,count=0;missing.size&&page!==null&&count<100;count++){
    const result=await labels({...input,page});if(!result.ok)return result;
    for(const label of result.items)missing.delete(label);page=result.nextPage;
   }
   if(missing.size)return invalid;
  }
  if(input.milestoneId){
   const result=await scope.session.get(`/projects/${input.projectId}/milestones/${input.milestoneId}`);if(!result.ok)return result;
   const parsed=z.object({id:z.number(),project_id:z.number()}).safeParse(result.data);
   if(!parsed.success||parsed.data.id!==input.milestoneId||parsed.data.project_id!==input.projectId)return invalid;
  }
  if(input.issueId&&(input.assigneeIds?.length||input.labels?.length||input.milestoneId)){
   const latest=await read({...input,issueId:input.issueId});if(!latest.ok)return latest;
   if(latest.issue.revision!==input.revision)return {ok:false as const,error:"stale_issue" as const};
  }
  const body:Record<string,unknown>={...(input.title!==undefined?{title:input.title}:{}),...(input.description!==undefined?{description:input.description}:{}),...(input.confidential!==undefined?{confidential:input.confidential}:{}),...(input.stateEvent?{state_event:input.stateEvent}:{})};
  if(input.assigneeIds!==undefined)body.assignee_ids=input.assigneeIds.join(",");
  if(input.labels!==undefined)body.labels=input.labels.join(",");
  if(input.milestoneId!==undefined)body.milestone_id=input.milestoneId;
  if(input.priority!==undefined)body.priority=input.priority;
  if(input.resolveState!==undefined)body.resolve_state=input.resolveState;
  const path=`/projects/${input.projectId}/issues`;
  const result=input.issueId?await scope.session.put(`${path}/${input.issueId}`,body):await scope.session.post(path,{confidential:false,...body});
  if(!result.ok)return {ok:false as const,error:["network_error","service_error","invalid_response"].includes(result.error)?"outcome_unknown" as const:result.error};
  const created=z.object({id:z.number().int().positive()}).safeParse(result.data),id=input.issueId??(created.success?created.data.id:undefined);
  if(!id)return {ok:false as const,error:"outcome_unknown" as const};
  const after=await read({...input,issueId:id});
  const equal=(a:unknown[],b:unknown[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
  if(!after.ok||input.title!==undefined&&after.issue.title!==input.title||input.description!==undefined&&after.issue.description!==input.description||input.confidential!==undefined&&after.issue.confidential!==input.confidential||input.stateEvent&&after.issue.state!==(input.stateEvent==="close"?"closed":"opened")||input.assigneeIds!==undefined&&!equal(input.assigneeIds,after.issue.assignees.map(u=>u.id))||input.labels!==undefined&&!equal(input.labels,after.issue.labels)||input.milestoneId!==undefined&&(after.issue.milestone?.id??null)!==input.milestoneId||input.priority!==undefined&&after.issue.priority!==input.priority||input.resolveState!==undefined&&after.issue.resolveState!==input.resolveState)return {ok:false as const,error:"outcome_unknown" as const};
  return after;
 }));
 server.handle(issueNotes,async input=>{
  const scope=await access(input);if(!scope.ok)return scope;
  const issue=await read(input);if(!issue.ok)return issue;
  const result=await scope.session.get(`/projects/${input.projectId}/issues/${input.issueId}/notes`,{page:String(input.page),per_page:"20"});if(!result.ok)return result;
  const parsed=z.array(rawNote).safeParse(result.data);if(!parsed.success)return invalid;
  try{return {ok:true as const,items:parsed.data.map(n=>normalizeNote(n,scope.session.siteUrl)),nextPage:nextPage(result.headers,parsed.data.length,input.page)};}catch{return invalid;}
 });
 server.handle(saveIssueNote,input=>api.exclusive(async()=>{
  const scope=await access(input);if(!scope.ok)return scope;
  const issue=await read(input);if(!issue.ok)return issue;
  const path=`/projects/${input.projectId}/issues/${input.issueId}/notes`,session=scope.session;
  async function note(id:number){
   const result=await session.get(`${path}/${id}`);if(!result.ok)return result;
   const parsed=rawNote.safeParse(result.data);if(!parsed.success||parsed.data.id!==id)return invalid;
   return {ok:true as const,note:normalizeNote(parsed.data,session.siteUrl)};
  }
  if(input.noteId){
   const before=await note(input.noteId);if(!before.ok)return before;
   if(before.note.system||before.note.author?.id!==input.accountId)return {ok:false as const,error:"forbidden" as const};
   if(before.note.revision!==input.revision||before.note.truncated)return {ok:false as const,error:"stale_note" as const};
  }
  const result=input.noteId?await scope.session.put(`${path}/${input.noteId}`,{body:input.body}):await scope.session.post(path,{body:input.body});
  if(!result.ok)return {ok:false as const,error:["network_error","service_error","invalid_response"].includes(result.error)?"outcome_unknown" as const:result.error};
  const parsed=z.object({id:z.number().int().positive()}).safeParse(result.data),id=input.noteId??(parsed.success?parsed.data.id:undefined);
  if(!id)return {ok:false as const,error:"outcome_unknown" as const};
  const current=await note(id);
  if(!current.ok||current.note.body!==input.body||current.note.system||current.note.author?.id!==input.accountId)return {ok:false as const,error:"outcome_unknown" as const};
  return current;
 }));
}
