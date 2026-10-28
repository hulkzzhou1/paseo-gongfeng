import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGongfengService } from "./service.ts";
import { issuesPage, issueDetail, saveIssue, issueMembers, issueLabels, issueMilestones, issueNotes, saveIssueNote } from "../shared/issues.ts";
import { addManagedRepository } from "../shared/repositories.ts";
let home: string, previous: string | undefined, service: ReturnType<typeof createGongfengService>;
const row = { id: 100, iid: 2, project_id: 10, title: "Issue", description: "## Plan", state: "opened", confidential: true, author: { id: 8, username: "other", name: "Other" }, assignees: [{ id: 7, username: "test", name: "Test" }], labels: ["bug"], milestone: null, priority: "P1", updated_at: "2026-10-26T01:00:00Z" };
let respond: (url: URL, init: RequestInit) => Response | Promise<Response>;
beforeEach(async () => {
 home = await mkdtemp(join(tmpdir(), "gongfeng-issues-")); previous = process.env.PASEO_HOME; process.env.PASEO_HOME = home; await writeFile(join(home, "server-id"), "test-host"); service = createGongfengService();
 mock.method(globalThis, "fetch", async (url: string | URL | Request, init: RequestInit) => {
  const u = new URL(String(url));
  if (u.pathname.endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
  if (/\/projects\/\d+$/.test(u.pathname)) { const id = Number(u.pathname.split("/").at(-1)); return Response.json({ id, path_with_namespace: `Demo/Repo${id}`, name: "Repo" }); }
  return respond(u, init);
 });
 assert((await service.api.save("fictional-token")).ok);
 assert((await service.execute(addManagedRepository, { repositoryId: 10 }) as {ok:boolean}).ok);
});

test("议题关系筛选、编号和分页限定仓库；过滤后空页仍保留续页",async()=>{
 const requests:URL[]=[];
 respond=url=>{requests.push(url);return Response.json([{...row,author:{id:8,username:"other",name:"Other"}}],{headers:{"X-Next-Page":"2"}});};
 const page=issuesPage.output.parse(await service.execute(issuesPage,{accountId:7,state:"all",relation:"created",query:"#2"}));assert(page.ok);assert.equal(page.items.length,0);assert.deepEqual(page.next,[{projectId:10,page:2}]);
 assert.equal(requests[0].searchParams.get("author_id"),"7");assert.equal(requests[0].searchParams.get("iid"),"2");assert(!requests[0].searchParams.has("state"));
 assert.deepEqual(await service.execute(issuesPage,{accountId:7,state:"all",relation:"all",cursors:[{projectId:999,page:1}]}),{ok:false,error:"invalid_response"});
 respond=()=>Response.json({...row,project_id:99});
 assert.deepEqual(await service.execute(issueDetail,{accountId:7,projectId:10,issueId:100}),{ok:false,error:"invalid_response"});
});

afterEach(async () => { service.dispose(); mock.restoreAll(); if(previous === undefined)delete process.env.PASEO_HOME;else process.env.PASEO_HOME=previous; await rm(home,{recursive:true,force:true}); });

test("全部议题按已添加仓库查询而非创建人，局部失败保留结果，详情核对全局身份", async () => {
 respond = (url, init) => {
  assert.equal(init.method, "GET");
  if(url.pathname.includes("/20/"))return new Response(null,{status:403});
  assert(!url.searchParams.has("author_id"));
  return Response.json(url.pathname.endsWith("/100")?row:[row],{headers:{"X-Next-Page":""}});
 };
 await service.execute(addManagedRepository,{repositoryId:20});
 const result = issuesPage.output.parse(await service.execute(issuesPage,{accountId:7,state:"opened",relation:"all"})); assert(result.ok);
 assert.deepEqual(result.items.map(i=>[i.id,i.author?.id,i.confidential]),[[100,8,true]]); assert.deepEqual(result.failures,[{projectId:20,error:"forbidden"}]);
 const detail=issueDetail.output.parse(await service.execute(issueDetail,{accountId:7,projectId:10,issueId:100})); assert(detail.ok);assert(detail.issue.revision);assert.equal(detail.issue.priority,1);
 assert.deepEqual(await service.execute(issueDetail,{accountId:8,projectId:10,issueId:100}),{ok:false,error:"account_changed"});
 assert.deepEqual(await service.execute(issueDetail,{accountId:7,projectId:999,issueId:100}),{ok:false,error:"stale_binding"});
});

test("议题新建编辑关闭重开回读，私密改普通需独立确认且拒绝旧版本",async()=>{
 let current={...row};const writes:Record<string,unknown>[]=[];
 respond=(_url,init)=>{
  if(init.method!=="GET"){
   const body=JSON.parse(String(init.body));writes.push(body);
   current={...current,...body,...(body.state_event?{state:body.state_event==="close"?"closed":"reopened"}:{})};
  }
  return Response.json(current);
 };
 const base={accountId:7,projectId:10};
 const created=saveIssue.output.parse(await service.execute(saveIssue,{...base,title:"New",description:"",confidential:true}));assert(created.ok);
 assert.deepEqual(writes[0],{title:"New",description:"",confidential:true});
 const ref={...base,issueId:100,revision:created.issue.revision};
 assert.deepEqual(await service.execute(saveIssue,{...ref,confidential:false}),{ok:false,error:"confirmation_required"});assert.equal(writes.length,1);
 const edited=saveIssue.output.parse(await service.execute(saveIssue,{...ref,confidential:false,confirmPublic:true,description:"## Updated"}));assert(edited.ok);assert.equal(edited.issue.confidential,false);
 assert.deepEqual(await service.execute(saveIssue,{...ref,title:"stale"}),{ok:false,error:"stale_issue"});assert.equal(writes.length,2);
 const closed=saveIssue.output.parse(await service.execute(saveIssue,{...ref,revision:edited.issue.revision,stateEvent:"close"}));assert(closed.ok);assert.equal(closed.issue.state,"closed");
 const reopened=saveIssue.output.parse(await service.execute(saveIssue,{...ref,revision:closed.issue.revision,stateEvent:"reopen"}));assert(reopened.ok);assert.equal(reopened.issue.state,"opened");
});

test("人员标签里程碑候选限仓库并分页；分类字段可设置与清空，不创建未知标签",async()=>{
 let current={...row,assignees:[] as typeof row.assignees,labels:[] as string[],milestone:null as {id:number;title:string}|null,resolve_state:"accepted"};const writes:Record<string,unknown>[]=[];
 respond=(url,init)=>{
  if(url.pathname.endsWith("/members/all"))return Response.json([{id:7,username:"test",name:"Test",state:"active"}],{headers:{"X-Next-Page":""}});
  if(url.pathname.endsWith("/labels"))return Response.json([{name:"bug"}],{headers:{"X-Next-Page":""}});
  if(url.pathname.endsWith("/milestones"))return Response.json([{id:50,project_id:10,title:"Release",state:"active"}],{headers:{"X-Next-Page":""}});
  if(url.pathname.endsWith("/milestones/50"))return Response.json({id:50,project_id:10,title:"Release",state:"active"});
  if(init.method==="PUT"){
   const b=JSON.parse(String(init.body));writes.push(b);current={...current,...(b.assignee_ids!==undefined?{assignees:b.assignee_ids?row.assignees:[]}:{}),...(b.labels!==undefined?{labels:b.labels?b.labels.split(","):[]}:{}),...(b.milestone_id!==undefined?{milestone:b.milestone_id?{id:50,title:"Release"}:null}:{}),...(b.priority!==undefined?{priority:`P${b.priority}`}:{}) ,...(b.resolve_state?{resolve_state:b.resolve_state}:{})};
  }return Response.json(current);
 };
 const base={accountId:7,projectId:10};
 for(const contract of [issueMembers,issueLabels,issueMilestones])assert((await service.execute(contract,base)as{ok:boolean}).ok);
 const first=issueDetail.output.parse(await service.execute(issueDetail,{...base,issueId:100}));assert(first.ok);
 const updated=saveIssue.output.parse(await service.execute(saveIssue,{...base,issueId:100,revision:first.issue.revision,assigneeIds:[7],labels:["bug"],milestoneId:50,priority:2,resolveState:"resolved"}));assert(updated.ok);assert.equal(updated.issue.priority,2);assert.equal(updated.issue.milestone?.id,50);
 const cleared=saveIssue.output.parse(await service.execute(saveIssue,{...base,issueId:100,revision:updated.issue.revision,assigneeIds:[],labels:[],milestoneId:null}));assert(cleared.ok);assert.deepEqual([cleared.issue.assignees,cleared.issue.labels,cleared.issue.milestone],[[],[],null]);
 assert.deepEqual(writes[0],{assignee_ids:"7",labels:"bug",milestone_id:50,priority:2,resolve_state:"resolved"});
 const count=writes.length;
 assert.deepEqual(await service.execute(saveIssue,{...base,issueId:100,revision:cleared.issue.revision,labels:["unknown"]}),{ok:false,error:"invalid_response"});assert.equal(writes.length,count);
});

test("评论分页、发表与本人编辑，拒绝他人/系统/旧版本且不重试未知写入",async()=>{
 let note={id:20,body:"**Initial**",system:false,author:{id:7,username:"test",name:"Test"},created_at:"2026-10-26",comments:[]},writes=0,network=false;
 respond=(url,init)=>{
  if(url.pathname.endsWith("/issues/100"))return Response.json(row);
  if(init.method!=="GET"){
   writes++;if(network)throw Error("fictional network failure");
   note={...note,body:JSON.parse(String(init.body)).body};
  }
  return Response.json(url.pathname.endsWith("/notes")&&init.method==="GET"?[note]:note,{headers:{"X-Next-Page":""}});
 };
 const ref={accountId:7,projectId:10,issueId:100};
 const page=issueNotes.output.parse(await service.execute(issueNotes,ref));assert(page.ok);assert.equal(page.items[0].body,"**Initial**");
 const created=saveIssueNote.output.parse(await service.execute(saveIssueNote,{...ref,body:"Posted"}));assert(created.ok);
 const edited=saveIssueNote.output.parse(await service.execute(saveIssueNote,{...ref,noteId:20,revision:created.note.revision,body:"Edited"}));assert(edited.ok);
 assert.deepEqual(await service.execute(saveIssueNote,{...ref,noteId:20,revision:created.note.revision,body:"Stale"}),{ok:false,error:"stale_note"});
 note.author.id=8;assert.deepEqual(await service.execute(saveIssueNote,{...ref,noteId:20,revision:edited.note.revision,body:"Other"}),{ok:false,error:"forbidden"});
 note.author.id=7;note.system=true;assert.deepEqual(await service.execute(saveIssueNote,{...ref,noteId:20,revision:edited.note.revision,body:"System"}),{ok:false,error:"forbidden"});
 network=true;const before=writes;assert.deepEqual(await service.execute(saveIssueNote,{...ref,body:"Uncertain"}),{ok:false,error:"outcome_unknown"});assert.equal(writes,before+1);
});

test("未知可见性不能变成普通议题，仓库外处理人不能通过共享处理器写入",async()=>{
 let missing=false,writes=0;
 respond=(url,init)=>{
  if(url.pathname.endsWith("/members/all"))return Response.json([{id:7,username:"test",name:"Test",state:"active"}],{headers:{"X-Next-Page":""}});
  if(init.method!=="GET")writes++;
  const data={...row} as Partial<typeof row>;if(missing)delete data.confidential;
  return Response.json(data);
 };
 const ref={accountId:7,projectId:10,issueId:100};
 const current=issueDetail.output.parse(await service.execute(issueDetail,ref));assert(current.ok);
 missing=true;
 assert.deepEqual(await service.execute(saveIssue,{...ref,revision:current.issue.revision,confidential:false,confirmPublic:true}),{ok:false,error:"invalid_response"});assert.equal(writes,0);
 missing=false;
 assert.deepEqual(await service.execute(saveIssue,{...ref,revision:current.issue.revision,assigneeIds:[999]}),{ok:false,error:"invalid_response"});assert.equal(writes,0);
});
