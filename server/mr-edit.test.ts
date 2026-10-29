import assert from "node:assert/strict";
import { beforeEach, afterEach, mock, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGongfengService } from "./service.ts";
import { mrDetail } from "../shared/detail.ts";
import { editMr } from "../shared/mr-edit.ts";

const ref = { siteUrl: "https://edit.example", accountId: 7, projectId: 10, mrId: 100 };
let home: string, previous: string | undefined, service: ReturnType<typeof createGongfengService>;
let title: string, description: string, account: number, targetProject: number;
let writes: Record<string, unknown>[];
let failure: "none" | "network" | "read" | "unchanged" | "json" | number;
async function detail() { const result = mrDetail.output.parse(await service.execute(mrDetail, ref)); assert(result.ok); return result.detail; }
async function save(input: unknown) { return editMr.output.parse(await service.execute(editMr, input)); }
beforeEach(async () => {
  previous = process.env.PASEO_HOME; home = await mkdtemp(join(tmpdir(), "gongfeng-edit-")); process.env.PASEO_HOME = home;
  title = "Old title"; description = "Original\n**Markdown**"; account = 7; targetProject = 10; writes = []; failure = "none";
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)); assert.equal(url.origin, ref.siteUrl); assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("PRIVATE-TOKEN"), "fictional-token");
    if (url.pathname === "/api/v3/user") return Response.json({ id: account, username: "tester", name: "Tester" });
    if (url.pathname === "/api/v3/projects/10") return Response.json({ id: 10, path_with_namespace: "Team/Repo" });
    assert.equal(url.pathname, "/api/v3/projects/10/merge_request/100"); assert.equal(url.search, "");
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)); writes.push(body);
      if (typeof failure === "number") return new Response("private-upstream", { status: failure });
      if (failure !== "unchanged") { title = body.title ?? title; description = body.description ?? description; }
      if (failure === "network") throw Error("private-upstream");
      if (failure === "json") return new Response("private-upstream");
    } else if (failure === "read" && writes.length) return new Response(null, { status: 403 });
    return Response.json({ id: 100, iid: 5, title, description, state: "opened", source_project_id: 42, target_project_id: targetProject, source_branch: "feature", target_branch: "main", updated_at: "constant" });
  });
  service = createGongfengService(); assert((await service.api.save("fictional-token", ref.siteUrl)).ok);
});
afterEach(async () => { service.dispose(); mock.restoreAll(); if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous; await rm(home, { recursive: true, force: true }); });

test("标题与描述可分别更新、清空描述，使用全局 ID 并仅发送改动字段", async () => {
  let current = await detail();
  let result = await save({ ...ref, revision: current.editRevision, title: " New title " });
  assert(result.ok); assert.equal(result.current.title, "New title"); assert.equal(result.current.description, description);
  current = result.current;
  result = await save({ ...ref, revision: current.editRevision, description: "" });
  assert(result.ok); assert.equal(result.current.description, ""); assert.equal(result.current.title, "New title");
  assert.deepEqual(writes, [{ title: "New title" }, { description: "" }]);
  assert((await save({ ...ref, revision: result.current.editRevision, title: "New title", description: "" })).ok);
  assert.equal(writes.length, 2);
});

test("更新时间不变时也检测完整描述变化，拒绝过期草稿和排队的第二次编辑", async () => {
  const current = await detail(); description = "Changed by someone else";
  const stale = await save({ ...ref, revision: current.editRevision, title: "Overwrite" });
  assert(!stale.ok); assert.equal(stale.error, "stale_mr_edit"); assert.equal(writes.length, 0);
  const fresh = await detail();
  const results = await Promise.all([save({ ...ref, revision: fresh.editRevision, title: "First" }), save({ ...ref, revision: fresh.editRevision, description: "Second" })]);
  assert(results[0].ok); assert(!results[1].ok); assert.equal(results[1].error, "stale_mr_edit"); assert.equal(writes.length, 1);
});

test("截断描述禁止回写但允许只改标题，截断以外的变更也影响 revision", async () => {
  description = "x".repeat(100001); const current = await detail(); assert(current.descriptionTruncated);
  const result = await save({ ...ref, revision: current.editRevision, description: current.description });
  assert(!result.ok); assert.equal(result.error, "mr_description_truncated"); assert.equal(writes.length, 0);
  assert((await save({ ...ref, revision: current.editRevision, title: "Title only" })).ok); assert.equal(description.length, 100001);
  const fresh = await detail(); description = "x".repeat(100000) + "y";
  assert.notEqual((await detail()).editRevision, fresh.editRevision);
});

test("拒绝跨账号、站点和错配目标项目，以及非法或额外编辑参数", async () => {
  const input = { ...ref, revision: (await detail()).editRevision, title: "Edited" };
  for (const bad of [{ ...input, title: " " }, { ...input, title: "x".repeat(256) }, { ...input, description: "x".repeat(100001) }, { ...input, state_event: "merge" }, { ...ref, revision: input.revision }]) await assert.rejects(save(bad));
  assert.deepEqual(await save({ ...input, accountId: 8 }), { ok: false, error: "account_changed" });
  assert.deepEqual(await save({ ...input, siteUrl: "https://other.example" }), { ok: false, error: "account_changed" });
  targetProject = 42; assert.deepEqual(await save(input), { ok: false, error: "invalid_response" });
  assert.equal(writes.length, 0);
});

for (const mode of [401, 403, 404, 429, 500, "network", "json", "read", "unchanged"] as const) test(`编辑失败 ${mode} 返回安全错误或未知结果，不自动重试写入`, async () => {
  const input = { ...ref, revision: (await detail()).editRevision, title: "Edited", description: "New Markdown" }; failure = mode;
  const result = await save(input); assert(!result.ok);
  const errors: Record<number, string> = { 401: "unauthorized", 403: "forbidden", 404: "not_found", 429: "rate_limited" };
  assert.equal(result.error, typeof mode === "number" && errors[mode] || "outcome_unknown"); assert.equal(result.attempted, true); assert.equal(writes.length, 1);
  assert(!JSON.stringify(result).includes("private-upstream")); assert(!JSON.stringify(result).includes("fictional-token"));
});

test("MR 编辑底层白名单不开放其他字段、混合里程碑或状态 query", async () => {
  const session = await service.api.session(); assert(session.ok);
  for (const body of [{}, { title: " " }, { description: "text", milestone_id: 1 }, { title: "text", target_branch: "main" }, { title: "text", state_event: "close" }]) assert.deepEqual(await session.put("/projects/10/merge_request/100", body), { ok: false, error: "invalid_response" });
  assert.deepEqual(await session.put("/projects/10/merge_request/100", { title: "New" }, { state_event: "close" }), { ok: false, error: "invalid_response" });
  assert.equal(writes.length, 0);
});
