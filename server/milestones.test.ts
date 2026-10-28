import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ZodType } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createGongfengClient } from "./gongfeng.ts";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { addManagedRepository } from "../shared/repositories.ts";
import { milestonesPage, milestoneDetail, saveMilestone, deleteMilestone, milestoneItems, saveMilestoneLinks, searchMilestoneItems } from "../shared/milestones.ts";
let home: string, oldHome: string | undefined, cleanup: ReturnType<typeof contribute>;
let handlers: Map<string, (input: unknown) => unknown>;
const account = { id: 7, username: "test", name: "Test" };
const base = { accountId: 7, projectId: 10 };
const milestone = { id: 100, iid: 2, project_id: 10, title: "Release", description: "**Goals**", state: "active", due_date: "2030-01-02", updated_at: "2026-10-23T00:00:00Z" };
async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown) { const handler = handlers.get(contract.name); assert(handler, `Missing RPC ${contract.name}`); return contract.output.parse(await handler(contract.input.parse(input))); }
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "gongfeng-milestones-")); oldHome = process.env.PASEO_HOME; process.env.PASEO_HOME = home; await writeFile(join(home, "server-id"), "test-daemon"); handlers = new Map(); cleanup = contribute({ registerSettings(definition) { return { read: async () => ({ status: "ready" as const, revision: "test", values: definition.schema.parse({}) }), subscribe: () => () => {} }; }, before() { return () => {}; }, handle(contract, handler) { handlers.set(contract.name, input => handler(contract.input.parse(input), {} as never)); } } satisfies Pick<PluginServerContext, "handle" | "before" | "registerSettings"> as unknown as PluginServerContext); });
afterEach(async () => { cleanup(); mock.restoreAll(); if (oldHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = oldHome; await rm(home, { recursive: true, force: true }); });
async function connect(respond: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url)); assert.equal(init?.redirect, "error");
    if (u.pathname === "/api/v3/user") return Response.json(account);
    if (/^\/api\/v3\/projects\/\d+$/.test(u.pathname)) { const id = Number(u.pathname.split("/").at(-1)); return Response.json({ id, name: "Repo", path_with_namespace: `Team/Repo${id}` }); }
    return respond(u, init);
  });
  await rpc(saveConnection, { token: "test-only-token" }); await rpc(addManagedRepository, { repositoryId: 10 });
}
test("汇总仅包含已添加仓库，局部无权限不清空成功结果，详情使用全局ID", async () => {
  await connect(url => {
    if (url.pathname === "/api/v3/projects/20/milestones") return new Response(null, { status: 403 });
    assert(["/api/v3/projects/10/milestones", "/api/v3/projects/10/milestones/100"].includes(url.pathname));
    return Response.json(url.pathname.endsWith("/100") ? milestone : [milestone], { headers: { "X-Next-Page": "" } });
  });
  await rpc(addManagedRepository, { repositoryId: 20 });
  const page = await rpc(milestonesPage, { accountId: 7, state: "active" }); assert(page.ok);
  assert.deepEqual(page.items.map(x => [x.projectId, x.id, x.iid]), [[10, 100, 2]]); assert.equal(page.failures[0].projectId, 20); assert.deepEqual(page.next, []);
  const detail = await rpc(milestoneDetail, { ...base, milestoneId: 100 }); assert(detail.ok); assert.equal(detail.milestone.description, "**Goals**"); assert(detail.milestone.revision);
  assert.deepEqual(await rpc(milestoneDetail, { ...base, projectId: 999, milestoneId: 100 }), { ok: false, error: "stale_binding" });
});

test("里程碑查询不限制创建人；同仓库切换账号后仍查询仓库的全部里程碑", async () => {
  const queries: URL[] = [];
  await connect(url => {
    queries.push(url);
    return Response.json([{ ...milestone, author: { id: 7 } }], { headers: { "X-Next-Page": "" } });
  });
  const first = await rpc(milestonesPage, { accountId: 7, state: "all" }); assert(first.ok);
  const originalFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => new URL(String(url)).pathname === "/api/v3/user" ? Response.json({ id: 8, username: "other", name: "Other" }) : originalFetch(url, init));
  await rpc(saveConnection, { token: "other-test-only-token" });
  const second = await rpc(milestonesPage, { accountId: 8, state: "all" }); assert(second.ok);
  assert.deepEqual(second.items, first.items);
  assert.equal(second.items[0].id, 100);
  assert.equal(queries.length, 2);
  for (const url of queries) {
    assert.equal(url.pathname, "/api/v3/projects/10/milestones");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["order_by", "page", "per_page", "sort"]);
  }
});


test("里程碑创建编辑清空日期、关闭重开及删除，经回读确认且拒绝旧版本", async () => {
  let current: Record<string, unknown> | null = { ...milestone }; const writes: { method?: string; body: Record<string, unknown> }[] = [];
  await connect((url, init) => {
    if (init?.method !== "GET") {
      const body = JSON.parse(String(init?.body ?? "{}")); writes.push({ method: init?.method, body });
      assert.equal(url.search, "");
      if (init?.method === "DELETE") { current = null; return new Response(null, { status: 200 }); }
      current = { ...(current ?? milestone), ...body, ...(body.state_event ? { state: body.state_event === "close" ? "closed" : "active" } : {}), updated_at: "2026-10-23T01:00:00Z" }; return Response.json(current);
    }
    return current ? Response.json(current) : new Response(null, { status: 404 });
  });
  const created = await rpc(saveMilestone, { ...base, title: "Release", description: "Goals", dueDate: "2030-01-02" }); assert(created.ok);
  const ref = { ...base, milestoneId: 100, revision: created.milestone.revision };
  const edited = await rpc(saveMilestone, { ...ref, title: "Renamed", description: "", dueDate: null }); assert(edited.ok); assert.equal(edited.milestone.description, ""); assert.equal(edited.milestone.dueDate, null);
  assert.deepEqual(writes.at(-1)?.body, { title: "Renamed", description: "", due_date: "" });
  const before = writes.length; assert.deepEqual(await rpc(deleteMilestone, { ...ref, title: "Release" }), { ok: false, error: "stale_milestone" }); assert.equal(writes.length, before);
  const closed = await rpc(saveMilestone, { ...ref, revision: edited.milestone.revision, title: "Renamed", description: "", dueDate: null, stateEvent: "close" }); assert(closed.ok); assert.equal(closed.milestone.state, "closed");
  const reopened = await rpc(saveMilestone, { ...ref, revision: closed.milestone.revision, title: "Renamed", description: "", dueDate: null, stateEvent: "active" }); assert(reopened.ok); assert.equal(reopened.milestone.state, "active");
  assert.deepEqual(await rpc(deleteMilestone, { ...ref, revision: reopened.milestone.revision, title: "Renamed" }), { ok: true });
});

test("截断描述不能回写覆盖完整里程碑，省略描述仍可编辑标题", async () => {
  const description = "x".repeat(100000) + "必须保留的末尾";
  let current = { ...milestone, description };
  await connect((_url, init) => {
    if (init?.method === "PUT") current = { ...current, ...JSON.parse(String(init.body)) };
    return Response.json(current);
  });
  const reference = { ...base, milestoneId: milestone.id };
  const before = await rpc(milestoneDetail, reference); assert(before.ok);
  assert.equal(before.milestone.descriptionTruncated, true);
  const refused = await rpc(saveMilestone, { ...reference, revision: before.milestone.revision, title: "Renamed", description: before.milestone.description });
  assert.equal(refused.ok, false);
  assert(!refused.ok); assert.equal(refused.error, "invalid_response");
  const unchanged = await rpc(milestoneDetail, reference); assert(unchanged.ok);
  assert.equal(unchanged.milestone.revision, before.milestone.revision);
  const edited = await rpc(saveMilestone, { ...reference, revision: before.milestone.revision, title: "Renamed" }); assert(edited.ok);
  assert.equal(edited.milestone.title, "Renamed");
  assert.equal(edited.milestone.descriptionTruncated, true);
});

test("关联编辑只写里程碑字段，明确确认后迁移并使用JSON null取消，分别加载MR和议题", async () => {
  const issue = { id: 301, iid: 3, project_id: 10, title: "Bug", state: "closed", milestone: { id: 200, title: "Earlier" } as { id: number; title: string } | null };
  const mr = { id: 401, iid: 4, target_project_id: 10, title: "Fix", state: "merged", milestone: { id: 100, title: "Release" } as { id: number; title: string } | null };
  const writes: unknown[] = [];
  await connect((url, init) => {
    if (url.pathname === "/api/v3/projects/10/milestones/100") return Response.json(milestone);
    const item = url.pathname.includes("/issues/301") ? issue : mr;
    if (init?.method === "PUT") { const body = JSON.parse(String(init.body)); assert.deepEqual(Object.keys(body), ["milestone_id"]); writes.push(body); item.milestone = body.milestone_id === null ? null : { id: body.milestone_id, title: "Release" }; return Response.json(item); }
    if (url.pathname.endsWith("/milestones/100/issues")) return Response.json(issue.milestone?.id === 100 ? [issue] : [], { headers: { "X-Next-Page": "" } });
    if (url.pathname.endsWith("/merge_requests")) return Response.json([mr], { headers: { "X-Next-Page": "" } });
    return Response.json(item);
  });
  const ref = { ...base, milestoneId: 100 };
  assert.deepEqual(await rpc(saveMilestoneLinks, { ...ref, changes: [{ kind: "issue", id: 301, originalMilestoneId: 200, action: "add" }], confirmMigration: false }), { ok: false, error: "conflict" }); assert.equal(writes.length, 0);
  const linked = await rpc(saveMilestoneLinks, { ...ref, changes: [{ kind: "issue", id: 301, originalMilestoneId: 200, action: "add" }, { kind: "mr", id: 401, originalMilestoneId: 100, action: "remove" }], confirmMigration: true }); assert(linked.ok); assert.equal(linked.complete, true); assert.deepEqual(writes, [{ milestone_id: 100 }, { milestone_id: null }]);
  const issues = await rpc(milestoneItems, { ...ref, kind: "issue", page: 1 }); assert(issues.ok); assert.equal(issues.items[0].state, "closed");
  const mrs = await rpc(milestoneItems, { ...ref, kind: "mr", page: 1 }); assert(mrs.ok); assert.equal(mrs.items.length, 0);
});

test("关联草稿任一归属冲突时整体不写入，部分写入失败会停止且保留实际结果", async () => {
  const rows = [1, 2, 3].map(id => ({ id, iid: id, project_id: 10, title: `Issue ${id}`, state: "opened", milestone: null as { id: number; title: string } | null }));
  let writes = 0;
  await connect((url, init) => {
    if (url.pathname.endsWith("/milestones/100")) return Response.json(milestone);
    if (url.pathname.endsWith("/milestones/100/issues")) return Response.json(rows.filter(i => i.milestone?.id === 100), { headers: { "X-Next-Page": "" } });
    const id = Number(url.pathname.split("/").at(-1)), row = rows.find(i => i.id === id)!;
    if (init?.method === "PUT") { writes++; if (id === 2) return new Response(null, { status: 403 }); row.milestone = { id: 100, title: "Release" }; }
    return Response.json(row);
  });
  const ref = { ...base, milestoneId: 100 }, changes = rows.map(i => ({ kind: "issue" as const, id: i.id, originalMilestoneId: null, action: "add" as const }));
  assert.deepEqual(await rpc(saveMilestoneLinks, { ...ref, confirmMigration: true, changes: [...changes.slice(0, 2), { ...changes[2], originalMilestoneId: 200 }] }), { ok: false, error: "conflict" }); assert.equal(writes, 0);
  const partial = await rpc(saveMilestoneLinks, { ...ref, confirmMigration: true, changes }); assert(partial.ok); assert.equal(partial.complete, false); assert.equal(partial.attempted, true); assert.deepEqual(partial.results.map(r => [r.id, r.ok]), [[1, true], [2, false]]); assert.equal(writes, 2);
  const linked = await rpc(milestoneItems, { ...ref, kind: "issue", page: 1 }); assert(linked.ok); assert.deepEqual(linked.items.map(i => i.id), [1]);
});

test("跨仓库每批最多四个请求，续页保留未查仓库，过滤后的空页不丢失下一页", async () => {
  let active = 0, max = 0;
  await connect(async url => {
    active++; max = Math.max(max, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
    const projectId = Number(url.pathname.split("/")[4]);
    return Response.json([{ ...milestone, id: projectId * 100, project_id: projectId, state: url.searchParams.get("page") === "2" ? "active" : "closed" }], { headers: { "X-Next-Page": url.searchParams.get("page") === "2" ? "" : "2" } });
  });
  for (const repositoryId of [20, 30, 40, 50]) await rpc(addManagedRepository, { repositoryId });
  const first = await rpc(milestonesPage, { accountId: 7, state: "active" }); assert(first.ok); assert.equal(first.items.length, 0); assert.equal(first.next.length, 5); assert.equal(max, 4);
  const next = await rpc(milestonesPage, { accountId: 7, state: "active", cursors: first.next }); assert(next.ok); assert.equal(next.items.length, 3); assert(next.next.length > 0);
  assert.deepEqual(await rpc(milestonesPage, { accountId: 8, state: "active" }), { ok: false, error: "account_changed" });
  assert.deepEqual(await rpc(milestonesPage, { accountId: 7, state: "active", cursors: [{ projectId: 999, page: 1 }] }), { ok: false, error: "invalid_response" });
});

test("写接口白名单拒绝额外MR字段及假取消值，状态切换不覆盖描述日期", async () => {
  let row = { ...milestone }, calls = 0;
  await connect((_url, init) => { calls++; if (init?.method === "PUT") { const body = JSON.parse(String(init.body)); assert.deepEqual(body, { title: "Release", state_event: "close" }); row = { ...row, state: "closed" }; } return Response.json(row); });
  const before = await rpc(milestoneDetail, { ...base, milestoneId: 100 }); assert(before.ok);
  const closed = await rpc(saveMilestone, { ...base, milestoneId: 100, revision: before.milestone.revision, title: "Release", stateEvent: "close" }); assert(closed.ok); assert.equal(closed.milestone.description, "**Goals**"); assert.equal(closed.milestone.dueDate, "2030-01-02");
  const api = createGongfengClient(); try { const session = await api.session(); assert(session.ok); const count = calls;
    assert.deepEqual(await session.put("/projects/10/merge_request/401", { milestone_id: 100, state_event: "merge" }), { ok: false, error: "invalid_response" });
    assert.deepEqual(await session.put("/projects/10/issues/301", { milestone_id: 0 }), { ok: false, error: "invalid_response" });
    assert.equal(calls, count);
  } finally { api.dispose(); }
});

test("关联候选以IID搜索但保留全局ID，历史MR与fork目标仓库身份正确", async () => {
  let wrongTarget = false;
  await connect(url => {
    if (url.pathname.endsWith("/milestones/100")) return Response.json(milestone);
    assert.equal(url.searchParams.has("state"), false);
    if (url.pathname.endsWith("/merge_requests")) {
      assert.equal(url.searchParams.get("iids[]"), "4");
      return Response.json([{ id: 401, iid: 4, title: "Fix", state: "closed", source_project_id: 99, target_project_id: wrongTarget ? 99 : 10, milestone: { id: 200, title: "Previous" } }], { headers: { "X-Next-Page": "" } });
    }
    assert.equal(url.searchParams.get("iid"), "3");
    return Response.json([{ id: 301, iid: 3, project_id: 10, title: "Bug", state: "closed" }], { headers: { "X-Next-Page": "" } });
  });
  const ref = { ...base, milestoneId: 100, page: 1 };
  const mr = await rpc(searchMilestoneItems, { ...ref, kind: "mr", query: "!4" }); assert(mr.ok); assert.deepEqual([mr.items[0].id, mr.items[0].iid, mr.items[0].milestone?.id], [401, 4, 200]);
  const issue = await rpc(searchMilestoneItems, { ...ref, kind: "issue", query: "#3" }); assert(issue.ok); assert.equal(issue.items[0].id, 301); assert.equal(issue.items[0].milestone, null);
  wrongTarget = true; assert.deepEqual(await rpc(searchMilestoneItems, { ...ref, kind: "mr", query: "!4" }), { ok: false, error: "invalid_response" });
});
