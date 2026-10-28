import assert from "node:assert/strict";
import { beforeEach, afterEach, mock, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginRpcContract } from "@getpaseo/plugin";
import { createGongfengService } from "./service.ts";
import { mrDetail } from "../shared/detail.ts";
import { changeMrState } from "../shared/mr-state.ts";

const reference = { siteUrl: "https://mr.example", accountId: 7, projectId: 10, mrId: 100 };
let home: string, previous: string | undefined, service: ReturnType<typeof createGongfengService>;
let state: string, clock: number, account: number, targetProject: number;
let writes: { path: string; query: Record<string, string>; body: unknown }[];
let failure: "none" | "forbidden" | "network" | "unchanged" | "read";
let handlers: Map<string, (input: any) => any>;
async function rpc(contract: PluginRpcContract, input: unknown) { return contract.output.parse(await handlers.get(contract.name)!(contract.input.parse(input))); }
async function detail() { const result = await rpc(mrDetail, reference) as any; assert(result.ok); return result.detail; }
beforeEach(async () => {
  previous = process.env.PASEO_HOME; home = await mkdtemp(join(tmpdir(), "gongfeng-state-")); process.env.PASEO_HOME = home;
  state = "opened"; clock = 1; account = 7; targetProject = 10; writes = []; failure = "none";
  mock.method(globalThis, "fetch", async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, reference.siteUrl); assert.equal(init?.redirect, "error");
    if (url.pathname === "/api/v3/user") return Response.json({ id: account, username: "tester", name: "Tester" });
    if (url.pathname === "/api/v3/projects/10") return Response.json({ id: 10, path_with_namespace: "Demo/Repo" });
    assert.equal(url.pathname, "/api/v3/projects/10/merge_request/100");
    if ((init?.method ?? "GET") === "GET" && failure === "read" && writes.length) return new Response("private-upstream", { status: 503 });
    if (init?.method === "PUT") {
      writes.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (failure === "forbidden") return new Response("private-upstream", { status: 403 });
      if (failure !== "unchanged") { state = url.searchParams.get("state_event") === "close" ? "closed" : "reopened"; clock++; }
      if (failure === "network") throw Error("private-upstream");
    }
    return Response.json({ id: 100, iid: 5, title: "Fixture", state, source_project_id: 42, target_project_id: targetProject, source_branch: "feature", target_branch: "main", source_commit: "a".repeat(40), updated_at: String(clock) });
  });
  service = createGongfengService(); handlers = new Map();
  service.registerRpc({ handle(contract, handler) { handlers.set(contract.name, input => handler(input, {} as never)); } });
  assert((await service.api.save("fictional-token", reference.siteUrl)).ok);
});
afterEach(async () => { service?.dispose(); mock.restoreAll(); if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous; await rm(home, { recursive: true, force: true }); });

test("RPC关闭开放MR，使用全局ID及文档化query且回读确认", async () => {
  const before = await detail();
  const result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert(result.ok); assert.equal(result.current.state, "closed");
  assert.deepEqual(writes, [{ path: "/api/v3/projects/10/merge_request/100", query: { state_event: "close" }, body: {} }]);
});

test("RPC重开closed并允许重新关闭，不操作merged/locked/未知状态", async () => {
  state = "closed";
  let before = await detail();
  const reopened = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "reopen" }) as any;
  assert(reopened.ok); assert.equal(reopened.current.state, "reopened");
  const closed = await rpc(changeMrState, { ...reference, revision: reopened.current.stateRevision, event: "close" }) as any;
  assert(closed.ok); assert.equal(closed.current.state, "closed"); assert.equal(writes.length, 2);
  for (const value of ["merged", "locked", "unknown"]) {
    state = value; before = await detail();
    for (const event of ["close", "reopen"]) {
      const result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event }) as any;
      assert(!result.ok); assert.equal(result.error, "mr_state_unavailable");
    }
  }
  assert.equal(writes.length, 2);
});

test("拒绝旧版本、账号和目标项目不一致，不写入工蜂", async () => {
  const before = await detail(); clock++;
  let result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert.equal(result.error, "stale_mr_state");
  account = 8;
  result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert.equal(result.error, "account_changed");
  account = 7; targetProject = 42;
  result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert.equal(result.error, "invalid_response"); assert.equal(writes.length, 0);
});

for (const mode of ["forbidden", "network", "unchanged"] as const) test(`状态写入${mode}不自动重试，结果脱敏且可回读核对`, async () => {
  const before = await detail(); failure = mode;
  const result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert(!result.ok); assert.equal(result.error, mode === "forbidden" ? "forbidden" : "outcome_unknown");
  assert.equal(result.attempted, true); assert.equal(result.current.state, mode === "network" ? "closed" : "opened");
  assert.equal(writes.length, 1); assert(!JSON.stringify(result).includes("private-upstream")); assert(!JSON.stringify(result).includes("fictional-token"));
});

test("状态更新白名单拒绝合入、其他字段、Issue和额外query", async () => {
  const session = await service.api.session(); assert(session.ok);
  for (const [path, body, query] of [
    ["/projects/10/merge_request/100", {}, { state_event: "merge" }],
    ["/projects/10/merge_request/100", { title: "unexpected" }, { state_event: "close" }],
    ["/projects/10/merge_request/100", { milestone_id: 1 }, { state_event: "close" }],
    ["/projects/10/issues/100", {}, { state_event: "close" }],
    ["/projects/10/milestones/1", { title: "Unexpected" }, { state_event: "close" }],
    ["/projects/10/merge_request/100/reviewer/summary", { reviewer_event: "approve", summary: "" }, { state_event: "close" }],
    ["/projects/10/merge_request/100", {}, { state_event: "close", remove_source_branch: "true" }],
  ] as const) assert.deepEqual(await session.put(path, body, query), { ok: false, error: "invalid_response" });
  assert.equal(writes.length, 0);
});




test("写入后无法回读时返回结果未知，不能将请求成功当作状态确认", async () => {
  const before = await detail(); failure = "read";
  const result = await rpc(changeMrState, { ...reference, revision: before.stateRevision, event: "close" }) as any;
  assert(!result.ok); assert.equal(result.error, "outcome_unknown"); assert.equal(result.current, undefined); assert.equal(writes.length, 1);
});
