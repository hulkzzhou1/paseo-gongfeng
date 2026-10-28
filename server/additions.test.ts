import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ZodType } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { mrDetail } from "../shared/detail.ts";
import { mrTapd, mrCi } from "../shared/additions.ts";
let home: string, previousHome: string | undefined;
let cleanup: ReturnType<typeof contribute>;
let handlers: Map<string,(input: unknown)=>unknown>;
const account = { id: 7, username: "test", name: "Test" };
const ref = { projectId: 10, mrId: 100, accountId: 7 };
const sha = "a".repeat(40);
const mr = { id: 100, iid: 2, title: "Change", description: "Keep this description", state: "opened", source_project_id: 11, target_project_id: 10, source_branch: "feature", target_branch: "main", source_commit: sha };
const ciRef = { ...ref, sourceProjectId: 11, sourceSha: sha, targetBranch: "main", page: 1 };
async function rpc<T>(contract: {name:string;input:ZodType;output:ZodType<T>}, input: unknown) { const handler=handlers.get(contract.name); assert(handler, `Missing RPC ${contract.name}`); return contract.output.parse(await handler(contract.input.parse(input))); }
beforeEach(async()=>{ home=await mkdtemp(join(tmpdir(),"gongfeng-additions-")); previousHome=process.env.PASEO_HOME; process.env.PASEO_HOME=home; handlers=new Map(); cleanup=contribute({ before() { return () => {}; }, registerSettings(definition) { return { read: async () => ({ status: "ready" as const, revision: "test", values: definition.schema.parse({}) }), subscribe: () => () => {} }; }, handle(contract,handler) { handlers.set(contract.name,input=>handler(contract.input.parse(input),{} as never)); } } satisfies Pick<PluginServerContext,"handle"|"registerSettings"|"before"> as unknown as PluginServerContext); });
afterEach(async()=>{cleanup();mock.restoreAll();if(previousHome===undefined)delete process.env.PASEO_HOME;else process.env.PASEO_HOME=previousHome;await rm(home,{recursive:true,force:true});});
async function connect(response:(url:URL)=>Response|Promise<Response>) { mock.method(globalThis,"fetch", async (url:string|URL|Request, init?:RequestInit)=>{ assert.equal(init?.method,"GET");assert.equal(init?.redirect,"error");const path=new URL(String(url)); if(path.pathname.endsWith("/user"))return Response.json(account); if(path.pathname==="/api/v3/projects/10/merge_request/100")return Response.json(mr);if(path.pathname==="/api/v3/projects/10")return Response.json({id:10,path_with_namespace:"Team/Repo"});return response(path); });await rpc(saveConnection,{token:"test-only-token"}); }
test("TAPD使用MR的iid和精确字符串工作项ID，生成无凭据的固定原站链接",async()=>{
  await connect(url=>{assert.equal(url.pathname,"/api/v3/projects/10/tapd_workitems");assert.equal(url.searchParams.get("iid"),"2");assert.equal(url.searchParams.get("type"),"mr");return Response.json([{workspace_id:123,source_project_id:10,source_id:2,source_type:"mr",tapd_id:1020357985854905700,tapd_id_str:"1020357985854905695",tapd_type:"story",name:"Requirement",status_zh:"规划中"}]);});
  assert.deepEqual(await rpc(mrTapd,ref),{ok:true,items:[{id:"1020357985854905695",workspaceId:"123",kind:"story",title:"Requirement",status:"规划中",url:"https://tapd.woa.com/tapd_fe/123/story/detail/1020357985854905695"}],incomplete:false});
});

test("自定义站点的TAPD数据不生成内部链接，MR原站链接使用配置地址", async () => {
  await connect(() => Response.json([{ workspace_id: 123, source_project_id: 10, source_id: 2, source_type: "mr", tapd_id_str: "42", tapd_type: "story", name: "Requirement" }]));
  await rpc(saveConnection, { siteUrl: "https://code.example", token: "site-token" });
  const result = await rpc(mrTapd, { ...ref, siteUrl: "https://code.example" });
  assert(result.ok); assert.equal(result.items[0].url, null);
  const detail = await rpc(mrDetail, ref); assert(detail.ok); assert.equal(detail.detail.url, "https://code.example/Team/Repo/merge_requests/2");
});
test("CI使用fork源项目及固定SHA，验证响应版本，分页保留未完整状态",async()=>{
  await connect(url=>{assert.equal(url.pathname,`/api/v3/projects/11/commits/${sha}/status`);assert.equal(url.searchParams.get("target_branch"),"main");return Response.json({sha,state:"success",total_count:21,statuses:[{id:1,state:"success",context:"build",description:"ok",target_url:"https://ci.example.invalid/build/1"}]});});
  const result=await rpc(mrCi,ciRef);assert(result.ok);assert.equal(result.sha,sha);assert.equal(result.state,"success");assert.equal(result.total,21);assert.equal(result.nextPage,2);assert.equal(result.incomplete,true);assert.equal(result.items[0].url,"https://ci.example.invalid/build/1");
});
test("TAPD空列表与无权限分别返回，CI失败不影响详情",async()=>{
  let forbidden=false;
  await connect(url=>url.pathname.endsWith("/tapd_workitems") ? forbidden ? new Response("private details",{status:403}) : Response.json([]) : new Response("private details",{status:403}));
  assert.deepEqual(await rpc(mrTapd,ref),{ok:true,items:[],incomplete:false});
  forbidden=true;assert.deepEqual(await rpc(mrTapd,ref),{ok:false,error:"forbidden"});assert.deepEqual(await rpc(mrCi,ciRef),{ok:false,error:"forbidden"});
  const detail=await rpc(mrDetail,ref);assert(detail.ok);assert.equal(detail.detail.description,"Keep this description");
});
test("CI空检查不是通过；后续页展示多个检查并保留安全外链",async()=>{
  let empty=true;
  await connect(()=>Response.json({sha,state:"success",total_count:empty?0:22,statuses:empty?[]:[{id:21,state:"failed",context:"lint",description:"lint error",target_url:"javascript:alert(1)"},{id:22,state:"pending",context:"build",description:null,target_url:"https://user:password@ci.example.invalid/secret"}]}));
  let result=await rpc(mrCi,ciRef);assert(result.ok);assert.equal(result.state,"unknown");assert.equal(result.total,0);assert.equal(result.nextPage,null);
  empty=false;result=await rpc(mrCi,{...ciRef,page:2});assert(result.ok);assert.equal(result.nextPage,null);assert.equal(result.incomplete,false);assert.deepEqual(result.items.map(i=>i.url),[null,null]);assert.deepEqual(result.items.map(i=>i.state),["failed","pending"]);
});
test("其他提交的CI、MR已更新与账号变化均不能冒充当前版本结果",async()=>{
  let calls=0;await connect(()=>{calls++;return Response.json({sha:"b".repeat(40),state:"success",total_count:1,statuses:[{id:1,state:"success",context:"build"}]});});
  assert.deepEqual(await rpc(mrCi,ciRef),{ok:false,error:"version_changed"});assert.equal(calls,1);
  assert.deepEqual(await rpc(mrCi,{...ciRef,sourceSha:"c".repeat(40)}),{ok:false,error:"version_changed"});assert.equal(calls,1);
  assert.deepEqual(await rpc(mrCi,{...ciRef,sourceProjectId:15}),{ok:false,error:"version_changed"});assert.equal(calls,1);
  assert.deepEqual(await rpc(mrTapd,{...ref,accountId:8}),{ok:false,error:"account_changed"});assert.deepEqual(await rpc(mrCi,{...ciRef,accountId:8}),{ok:false,error:"account_changed"});
});
test("TAPD不猜测丢失精度的数字ID或错配工作项身份",async()=>{
  let row:Record<string,unknown>={workspace_id:123,source_project_id:10,source_id:2,source_type:"mr",tapd_id:1020357985854905700,tapd_type:"story",name:"Requirement"};
  await connect(()=>Response.json([row]));assert.deepEqual(await rpc(mrTapd,ref),{ok:false,error:"invalid_response"});
  row={...row,tapd_id_str:"1020357985854905695",source_id:100};assert.deepEqual(await rpc(mrTapd,ref),{ok:false,error:"invalid_response"});
  row={...row,source_id:2,tapd_type:"unknown_type"};const result=await rpc(mrTapd,ref);assert(result.ok);assert.equal(result.items[0].url,null);
});
test("CI总数矛盾不是有效检查结果，分页空洞标记不完整",async()=>{
  let count=0;await connect(()=>Response.json({sha,state:"success",total_count:count,statuses:count?[ ]:[{id:1,state:"success",context:"build"}]}));
  assert.deepEqual(await rpc(mrCi,ciRef),{ok:false,error:"invalid_response"});
  count=30;const result=await rpc(mrCi,ciRef);assert(result.ok);assert.equal(result.state,"unknown");assert.equal(result.incomplete,true);assert.equal(result.nextPage,null);
});
