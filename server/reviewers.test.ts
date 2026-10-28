import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { mrReview } from "../shared/detail.ts";
import { saveReviewers, searchReviewers, submitReview } from "../shared/reviewers.ts";
import { createGongfengClient } from "./gongfeng.ts";

let home: string, previousHome: string | undefined, stop: ReturnType<typeof contribute>;
let handlers: Map<string, (input: unknown) => unknown>;
let people: { id: number; name: string; username: string; type: string; review_state: string }[];
let calls: { method: string; path: string; body?: Record<string, unknown>; query: string }[];
let failInvite: "none" | "forbidden" | "partial" | "network";
let failDismiss: boolean;
let failOpinion: "none" | "forbidden" | "network";
let sourceSha: string, reviewClock: number;
const reference = { siteUrl: "https://code.example.com", accountId: 7, projectId: 10, mrId: 100 };
async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown): Promise<T> {
  const fn = handlers.get(contract.name); assert(fn, `Missing RPC ${contract.name}`);
  return contract.output.parse(await fn(contract.input.parse(input)));
}
beforeEach(async () => {
  previousHome = process.env.PASEO_HOME; home = await mkdtemp(join(tmpdir(), "gongfeng-reviewers-")); process.env.PASEO_HOME = home;
  people = [{ id: 11, name: "Alice", username: "alice", type: "invite", review_state: "approved" }, { id: 12, name: "Bob", username: "bob", type: "necessary", review_state: "approving" }];
  calls = []; failInvite = "none"; failDismiss = false; failOpinion = "none"; sourceSha = "a".repeat(40); reviewClock = 0;
  mock.method(globalThis, "fetch", async (value: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(value)), method = init?.method ?? "GET";
    assert.equal(url.origin, reference.siteUrl); assert.equal(init?.redirect, "error");
    if (url.pathname === "/api/v3/user") return Response.json({ id: 7, name: "Tester", username: "tester" });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body, query: url.search });
    if (method === "GET" && url.pathname.endsWith("/members/all")) {
      assert.equal(url.searchParams.get("query"), "char");
      return Response.json([{ id: 13, name: "Charlie", username: "charlie", state: "active", avatar_url: "/uploads/charlie.png", email: "private@example.invalid" }], { headers: { "x-next-page": "" } });
    }
    if (method === "GET" && url.pathname === "/api/v3/projects/10") return Response.json({ id: 10, path_with_namespace: "Test/Repo" });
    if (method === "GET" && url.pathname === "/api/v3/projects/10/merge_request/100") return Response.json({ id: 100, iid: 5, title: "Fixture", state: "opened", source_project_id: 10, target_project_id: 10, source_branch: "feature", target_branch: "main", source_commit: sourceSha, base_commit: "b".repeat(40), target_commit: "b".repeat(40) });
    if (method === "GET" && url.pathname.endsWith("/review")) return Response.json({ id: 900, reviewable_id: 100, reviewable_type: "merge_request", state: "approving", updated_at: String(reviewClock), approver_rule: 1, necessary_approver_rule: 1, reviewers: people });
    if (method === "PUT" && url.pathname.endsWith("/reviewer/summary")) {
      if (failOpinion === "forbidden") return new Response("upstream-private", { status: 403 });
      const person = people.find(p => p.id === 7); assert(person);
      person.review_state = body?.reviewer_event === "approve" ? "approved" : body?.reviewer_event === "require_change" ? "change_required" : body?.reviewer_event === "deny" ? "change_denied" : person.review_state;
      reviewClock++;
      if (failOpinion === "network") throw new Error("uncertain-private");
      return Response.json({});
    }
    if (method === "POST" && url.pathname.endsWith("/review/batch_invite")) {
      if (failInvite === "forbidden") return new Response("upstream-private", { status: 403 });
      for (const [key, type] of [["reviewer_ids", "invite"], ["necessary_reviewer_ids", "necessary"]] as const) {
        for (const id of (body?.[key] ?? []) as number[]) if (!people.some(p => p.id === id) && !(failInvite === "partial" && id === 14)) people.push({ id, name: "New reviewer", username: "new-reviewer", type, review_state: "approving" });
      }
      if (failInvite === "network") throw new Error("uncertain-private");
      return Response.json({ fail_list: failInvite === "partial" ? [{ user_id: 14, msg: "upstream-private" }] : [] });
    }
    if (method === "DELETE" && url.pathname.endsWith("/review/dismissals")) { if (failDismiss) return new Response("upstream-private", { status: 403 }); people = people.filter(p => p.id !== Number(url.searchParams.get("reviewer_id"))); return new Response(null, { status: 204 }); }
    throw new Error("Unexpected test request");
  });
  handlers = new Map(); stop = contribute({ before() { return () => {}; }, registerSettings(definition) { return { read: async () => ({ status: "ready" as const, revision: "test", values: definition.schema.parse({}) }), subscribe: () => () => {} }; }, handle(contract, handler) { handlers.set(contract.name, input => handler(input as never, {} as never)); } } satisfies Pick<PluginServerContext,"handle"|"registerSettings"|"before"> as unknown as PluginServerContext);
  await rpc(saveConnection, { siteUrl: reference.siteUrl, token: "test-only-token" });
});
afterEach(async () => { stop?.(); mock.restoreAll(); if (previousHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previousHome; await rm(home, { recursive: true, force: true }); });

test("搜索有项目权限的成员，仅返回人员展示字段", async () => {
  const result = await rpc(searchReviewers, { ...reference, query: "char" });
  assert(result.ok); assert.deepEqual(result.items, [{ id: 13, name: "Charlie", username: "charlie", avatarUrl: "https://code.example.com/uploads/charlie.png" }]); assert.equal(result.nextPage, null);
  assert.equal(calls[0].path, "/api/v3/projects/10/members/all");
});

test("保存普通和必要评审人的添加及移除，只调用限定的邀请和移除端点", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok);
  const result = await rpc(saveReviewers, { ...reference, revision: before.revision, reviewers: [{ id: 13, necessary: false }, { id: 14, necessary: true }] });
  assert(result.ok); assert(result.current.ok);
  assert.deepEqual(result.current.reviewers.map(p => [p.id, p.type]).sort(), [[13, "invite"], [14, "necessary"]]);
  const writes = calls.filter(c => c.method !== "GET");
  assert.equal(writes.length, 3);
  assert.deepEqual(writes[0].body, { reviewer_ids: [13], necessary_reviewer_ids: [14] });
  assert(writes[1].query.includes("reviewer_id=11")); assert(writes[2].query.includes("reviewer_id=12"));
  assert(writes.every(c => /\/review\/(batch_invite|dismissals)$/.test(c.path)));
  assert(!JSON.stringify(result).includes("test-only-token"));
});

test("普通和必要类型互换时先移除旧类型，再重新邀请并核对", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok);
  const result = await rpc(saveReviewers, { ...reference, revision: before.revision, reviewers: [{ id: 11, necessary: true }, { id: 12, necessary: false }] });
  assert(result.ok); assert(result.current.ok);
  assert.deepEqual(result.current.reviewers.map(p => [p.id, p.type, p.state]).sort(), [[11, "necessary", "approving"], [12, "invite", "approving"]]);
  assert.deepEqual(calls.filter(c => c.method !== "GET").map(c => c.method), ["DELETE", "DELETE", "POST"]);
});

test("评审意见或名单变化后拒绝旧版本，不发写请求；仅顺序变化仍可保存", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok);
  people[0].review_state = "approving";
  const result = await rpc(saveReviewers, { ...reference, revision: before.revision, reviewers: [] });
  assert(!result.ok); assert.equal(result.error, "stale_review"); assert(result.current?.ok);
  assert.equal(calls.filter(c => c.method !== "GET").length, 0);
  const current = result.current; people.reverse();
  const same = await rpc(saveReviewers, { ...reference, revision: current.revision, reviewers: current.reviewers.map(p => ({ id: p.id, necessary: p.type === "necessary" })) });
  assert(same.ok); assert.equal(calls.filter(c => c.method !== "GET").length, 0);
});

for (const mode of ["forbidden", "partial", "network"] as const) test(`邀请 ${mode} 后不盲目重试或继续删除，返回实际名单且不泄露上游原文`, async () => {
  const before = await rpc(mrReview, reference); assert(before.ok); failInvite = mode;
  const result = await rpc(saveReviewers, { ...reference, revision: before.revision, reviewers: [{ id: 13, necessary: false }, { id: 14, necessary: true }] });
  assert(!result.ok); assert(result.attempted); assert(result.current?.ok);
  assert.equal(calls.filter(c => c.method === "POST").length, 1); assert.equal(calls.filter(c => c.method === "DELETE").length, 0);
  assert.deepEqual(result.current.reviewers.map(p => p.id), mode === "forbidden" ? [11, 12] : mode === "partial" ? [11, 12, 13] : [11, 12, 13, 14]);
  assert(!JSON.stringify(result).includes("private"));
});

test("部分添加后移除被工蜂拒绝，保留已生效结果并停止后续移除", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok); failDismiss = true;
  const result = await rpc(saveReviewers, { ...reference, revision: before.revision, reviewers: [{ id: 13, necessary: false }] });
  assert(!result.ok); assert.equal(result.error, "forbidden"); assert(result.current?.ok);
  assert.deepEqual(result.current.reviewers.map(p => p.id), [11, 12, 13]);
  assert.equal(calls.filter(c => c.method === "DELETE").length, 1);
});

test("账号站点与输入校验阻止错配身份及重复人员，不发写请求", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok);
  for (const overrides of [{ accountId: 999 }, { siteUrl: "https://another.example.com" }]) {
    assert.deepEqual(await rpc(saveReviewers, { ...reference, ...overrides, revision: before.revision, reviewers: [] }), { ok: false, error: "account_changed" });
  }
  for (const reviewers of [[{ id: -1, necessary: false }], [{ id: 13, necessary: false }, { id: 13, necessary: true }], Array.from({ length: 101 }, (_, i) => ({ id: i + 1, necessary: false }))]) {
    await assert.rejects(rpc(saveReviewers, { ...reference, revision: before.revision, reviewers }));
  }
  assert.equal(calls.filter(c => c.method !== "GET").length, 0);
});

test("工蜂写方法不能调用取消、合并或任意路径", async () => {
  const api = createGongfengClient();
  try {
    const session = await api.session(reference.siteUrl); assert(session.ok);
    assert.deepEqual(await session.post("/projects/10/merge_request/100/review/cancel", {}), { ok: false, error: "invalid_response" });
    assert.deepEqual(await session.delete("/projects/10/merge_requests/100/merge", {}), { ok: false, error: "invalid_response" });
    assert.equal(calls.filter(c => c.method !== "GET").length, 0);
  } finally { api.dispose(); }
});

test("确认意见后仅提交当前账号对固定版本的同意意见，空附言重复同意不重发", async () => {
  people.push({ id: 7, name: "Tester", username: "tester", type: "invite", review_state: "approving" });
  const before = await rpc(mrReview, reference); assert(before.ok);
  const input = { ...reference, revision: before.revision, sourceSha, event: "approve", summary: "" };
  const result = await rpc(submitReview, input); assert(result.ok); assert(result.current.ok);
  assert.equal(result.current.reviewers.find(p => p.id === 7)?.state, "approved");
  const writes = calls.filter(c => c.method === "PUT"); assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/api/v3/projects/10/merge_request/100/reviewer/summary");
  assert.deepEqual(writes[0].body, { reviewer_event: "approve", summary: "" });
  assert((await rpc(submitReview, input)).ok); assert.equal(calls.filter(c => c.method === "PUT").length, 1);
});

for (const [event, expected] of [["require_change", "change_required"], ["deny", "change_denied"], ["comment", "approving"]] as const) test(`确认 ${event} 及附言通过同一意见端点提交，保留当前账号身份`, async () => {
  people.push({ id: 7, name: "Tester", username: "tester", type: "necessary", review_state: "approving" });
  const before = await rpc(mrReview, reference); assert(before.ok);
  const result = await rpc(submitReview, { ...reference, revision: before.revision, sourceSha, event, summary: "  评审意见  " });
  assert(result.ok); assert(result.current.ok); assert.equal(result.current.reviewers.find(p => p.id === 7)?.state, expected);
  assert.deepEqual(calls.find(c => c.method === "PUT")?.body, { reviewer_event: event, summary: "评审意见" });
});

test("非评审人、版本移动及过期名单均不能提交意见", async () => {
  const before = await rpc(mrReview, reference); assert(before.ok);
  const input = { ...reference, revision: before.revision, sourceSha, event: "approve", summary: "" };
  const outsider = await rpc(submitReview, input); assert(!outsider.ok); assert.equal(outsider.error, "forbidden");
  people.push({ id: 7, name: "Tester", username: "tester", type: "invite", review_state: "approving" });
  const stale = await rpc(submitReview, input); assert(!stale.ok); assert.equal(stale.error, "stale_review");
  const current = await rpc(mrReview, reference); assert(current.ok);
  sourceSha = "c".repeat(40);
  const moved = await rpc(submitReview, { ...input, revision: current.revision }); assert(!moved.ok); assert.equal(moved.error, "version_changed");
  assert.equal(calls.filter(c => c.method === "PUT").length, 0);
});

for (const mode of ["forbidden", "network"] as const) test(`发表意见 ${mode} 不自动重试，返回实际状态并隐藏上游原文`, async () => {
  people.push({ id: 7, name: "Tester", username: "tester", type: "invite", review_state: "approving" });
  const before = await rpc(mrReview, reference); assert(before.ok); failOpinion = mode;
  const result = await rpc(submitReview, { ...reference, revision: before.revision, sourceSha, event: "approve", summary: "意见" });
  assert(!result.ok); assert.equal(result.error, mode === "network" ? "review_outcome_unknown" : "forbidden");
  assert(result.current?.ok); assert.equal(result.current.reviewers.find(p => p.id === 7)?.state, mode === "network" ? "approved" : "approving");
  assert.equal(calls.filter(c => c.method === "PUT").length, 1); assert(!JSON.stringify(result).includes("private"));
});
