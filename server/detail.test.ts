import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { mrDetail, mrChanges, mrReview, mrNotes } from "../shared/detail.ts";

type Contract = { name: string; input: ZodType; output: ZodType };
let home: string;
let previousHome: string | undefined;
let cleanup: ReturnType<typeof contribute>;
let handlers: Map<string, (input: unknown) => unknown>;
const account = { id: 7, username: "alice", name: "Alice" };
const project = { id: 10, path_with_namespace: "Team/Sub/Repo" };
const mr = { id: 100, iid: 2, title: "A change", state: "opened", description: "<script>do not run</script>", source_project_id: 11, target_project_id: 10, source_branch: "feat", target_branch: "main", source_commit: "a".repeat(40), base_commit: "b".repeat(40), target_commit: "c".repeat(40), updated_at: "2026-10-22T00:00:00Z" };
const ref = { projectId: 10, mrId: 100, accountId: 7 };
const file = { old_path: "old.ts", new_path: "new.ts", diff: "@@ -1 +1 @@\n-old\n+new", new_file: false, deleted_file: false, renamed_file: true, is_too_large: false, is_collapse: false };
async function rpc(contract: Contract, input: unknown) {
  const handler = handlers.get(contract.name);
  assert(handler, `Missing RPC: ${contract.name}`);
  return contract.output.parse(await handler(contract.input.parse(input)));
}
beforeEach(async () => {
  previousHome = process.env.PASEO_HOME;
  home = await mkdtemp(join(tmpdir(), "gongfeng-board-"));
  process.env.PASEO_HOME = home;
  handlers = new Map();
  cleanup = contribute({ handle(contract, handler) {
    handlers.set(contract.name, (input) => handler(contract.input.parse(input), {} as never));
  } } as PluginServerContext);
});
afterEach(async () => {
  cleanup(); mock.restoreAll();
  if (previousHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
});
async function connect(response: (url: URL) => Response | Promise<Response>) {
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    const parsed = new URL(String(url));
    return parsed.pathname === "/api/v3/user" ? Response.json(account) : response(parsed);
  });
  await rpc(saveConnection, { token: "test-token" });
}
test("详情使用MR全局ID路由，保留固定版本并只生成可信工蜂外链", async () => {
  const paths: string[] = [];
  await connect((url) => { paths.push(url.pathname); return Response.json(url.pathname === "/api/v3/projects/10" ? project : mr); });
  const result = mrDetail.output.parse(await rpc(mrDetail, ref));
  assert(result.ok);
  assert.deepEqual(paths, ["/api/v3/projects/10/merge_request/100", "/api/v3/projects/10"]);
  assert.equal(result.detail.id, 100); assert.equal(result.detail.iid, 2);
  assert.equal(result.detail.sourceSha, "a".repeat(40)); assert.equal(result.detail.baseSha, "b".repeat(40));
  assert.equal(result.detail.description, "<script>do not run</script>");
  assert.equal(result.detail.url, "https://git.woa.com/Team/Sub/Repo/merge_requests/2");
});

test("差异夹在两次详情之间读取，版本与身份稳定才标为已核对", async () => {
  const paths: string[] = [];
  await connect((url) => { paths.push(url.pathname); return Response.json(url.pathname.endsWith("/changes") ? { ...mr, files: [file] } : url.pathname === "/api/v3/projects/10" ? project : mr); });
  const result = mrChanges.output.parse(await rpc(mrChanges, ref));
  assert(result.ok); assert.equal(result.consistency, "verified"); assert.equal(result.incomplete, false);
  assert.equal(result.files[0].renamedFile, true); assert.equal(result.files[0].oldPath, "old.ts");
  assert.deepEqual(paths.filter(p => p.includes("merge_request")), ["/api/v3/projects/10/merge_request/100", "/api/v3/projects/10/merge_request/100/changes", "/api/v3/projects/10/merge_request/100"]);
});

test("读取期间版本移动或changes身份滞后，拒绝把差异混入固定版本", async () => {
  let detailReads = 0;
  let staleChanges = false;
  await connect((url) => {
    if (url.pathname === "/api/v3/projects/10") return Response.json(project);
    if (url.pathname.endsWith("/changes")) return Response.json({ ...mr, iid: staleChanges ? 999 : mr.iid, files: [file] });
    detailReads++;
    return Response.json({ ...mr, source_commit: detailReads === 2 ? "d".repeat(40) : mr.source_commit });
  });
  const moved = mrChanges.output.parse(await rpc(mrChanges, ref));
  assert(moved.ok); assert.equal(moved.consistency, "changed"); assert.equal(moved.incomplete, true); assert.deepEqual(moved.files, []);
  staleChanges = true;
  const stale = mrChanges.output.parse(await rpc(mrChanges, ref));
  assert(stale.ok); assert.equal(stale.consistency, "changed"); assert.deepEqual(stale.files, []);
});

test("源SHA未知不使用merge_commit_sha代替；折叠、过大、缺失及本地截断均标记不完整", async () => {
  await connect((url) => Response.json(url.pathname === "/api/v3/projects/10" ? project : {
    ...mr, source_commit: null, merge_commit_sha: "e".repeat(40),
    ...(url.pathname.endsWith("/changes") ? { files: [
      { ...file, new_file: true, is_collapse: true },
      { ...file, deleted_file: true, is_too_large: true, diff: null },
      { ...file, diff: "x".repeat(200001) },
    ] } : {}),
  }));
  const result = mrChanges.output.parse(await rpc(mrChanges, ref));
  assert(result.ok); assert.equal(result.consistency, "unknown"); assert.equal(result.detail.sourceSha, null);
  assert.equal(result.incomplete, true); assert(result.files[0].newFile && result.files[0].collapsed);
  assert(result.files[1].deletedFile && result.files[1].tooLarge && result.files[1].truncated);
  assert.equal(result.files[2].diff.length, 200000); assert(result.files[2].truncated);
  assert.equal(result.discussionIncluded, false);
});

test("讨论用复数MR路由，嵌套回复保留父子关系及未证实完整性的提示", async () => {
  await connect((url) => {
    assert.equal(url.pathname, "/api/v3/projects/10/merge_requests/100/notes");
    assert.equal(url.searchParams.get("page"), "1");
    return Response.json([{ id: 1, parent_id: null, body: "top <script>bad</script>", author: { name: "Alice" }, created_at: "now", system: false,
      comments: [{ id: 2, parent_id: 1, body: "reply", author: { name: "Bob" }, created_at: "later", system: false, comments: [] }] }]);
  });
  const result = mrNotes.output.parse(await rpc(mrNotes, { ...ref, page: 1 }));
  assert(result.ok); assert.equal(result.nestedComplete, false); assert.equal(result.nextPage, null);
  assert.deepEqual(result.items.map(n => [n.id, n.parentId, n.body]), [[1, null, "top <script>bad</script>"], [2, 1, "reply"]]);
});

test("Review自身ID不会替换MR身份，评论或Review失败不影响其他详情区块", async () => {
  let reviewId = 100;
  let noteStatus = 200;
  await connect((url) => {
    if (url.pathname.endsWith("/notes")) return noteStatus === 200 ? Response.json([]) : new Response("private", { status: noteStatus });
    if (url.pathname.endsWith("/review")) return Response.json({ id: 900, reviewable_id: reviewId, reviewable_type: "merge_request", state: "approving", reviewers: [{ id: 5, username: "bob", name: "Bob", review_state: "approved" }] });
    return Response.json(url.pathname === "/api/v3/projects/10" ? project : mr);
  });
  const review = mrReview.output.parse(await rpc(mrReview, ref));
  assert(review.ok); assert.equal(review.reviewId, 900); assert.equal(review.mrId, 100); assert.equal(review.reviewers[0].state, "approved");
  reviewId = 99;
  assert.deepEqual(await rpc(mrReview, ref), { ok: false, error: "invalid_response" });
  noteStatus = 403;
  assert.deepEqual(await rpc(mrNotes, { ...ref, page: 1 }), { ok: false, error: "forbidden" });
  assert(mrDetail.output.parse(await rpc(mrDetail, ref)).ok);
});

test("审查卡片保留普通和必要评审规则，缺失或异常的可选规则不伪造通过", async () => {
  let extra: Record<string, unknown> = { approver_rule: -1, necessary_approver_rule: 1 };
  let reviewerType: string | undefined = "necessary";
  await connect(url => Response.json(url.pathname.endsWith("/review") ? {
    id: 900, reviewable_id: 100, reviewable_type: "merge_request", state: "approving", ...extra,
    reviewers: [{ id: 5, username: "bob", name: "Bob", review_state: "approved", type: reviewerType }],
  } : project));
  const full = mrReview.output.parse(await rpc(mrReview, ref));
  assert(full.ok);
  assert.equal(full.state, "approving");
  assert.equal(full.approverRule, -1);
  assert.equal(full.necessaryApproverRule, 1);
  assert.equal(full.reviewers[0].type, "necessary");
  extra = {}; reviewerType = undefined;
  const legacy = mrReview.output.parse(await rpc(mrReview, ref));
  assert(legacy.ok);
  assert.equal(legacy.approverRule, null);
  assert.equal(legacy.necessaryApproverRule, null);
  assert.equal(legacy.reviewers[0].type, null);
  extra = { approver_rule: "all", necessary_approver_rule: 1.5 };
  const invalidRules = mrReview.output.parse(await rpc(mrReview, ref));
  assert(invalidRules.ok);
  assert.equal(invalidRules.approverRule, null);
  assert.equal(invalidRules.necessaryApproverRule, null);
});

test("同一评审人的普通和必要关系折为一个人员，冲突意见不冒充同意，返回顺序不改变版本", async () => {
  let entries = [
    { id: 5, username: "bob", name: "Bob", review_state: "approved", type: "suggestion" },
    { id: 5, username: "bob", name: "Bob", review_state: "approving", type: "necessary" },
  ];
  await connect(() => Response.json({ id: 900, reviewable_id: 100, reviewable_type: "merge_request", state: "approving", reviewers: entries }));
  const first = mrReview.output.parse(await rpc(mrReview, ref)); assert(first.ok);
  assert.equal(first.reviewers.length, 1); assert.equal(first.reviewers[0].type, "necessary"); assert.equal(first.reviewers[0].state, "unknown");
  entries.reverse();
  const reversed = mrReview.output.parse(await rpc(mrReview, ref)); assert(reversed.ok); assert.equal(reversed.revision, first.revision);
  entries = entries.map(p => ({ ...p, review_state: "approved" }));
  const approved = mrReview.output.parse(await rpc(mrReview, ref)); assert(approved.ok); assert.equal(approved.reviewers[0].state, "approved"); assert.notEqual(approved.revision, first.revision);
});

test("缺少changes版本元数据仍显示差异，但不宣称版本一致", async () => {
  await connect(url => Response.json(url.pathname === "/api/v3/projects/10" ? project : url.pathname.endsWith("/changes") ? { files: [file] } : mr));
  const result = mrChanges.output.parse(await rpc(mrChanges, ref));
  assert(result.ok); assert.equal(result.consistency, "unknown"); assert(result.incomplete); assert.equal(result.files.length, 1);
});

test("讨论分页以顶层条数计算，深嵌套与大正文有明确截断", async () => {
  const note = { id: 1, parent_id: null, body: "x".repeat(20001), created_at: "now", comments: [] };
  await connect(url => {
    assert.equal(url.searchParams.get("page"), "2");
    return Response.json(Array.from({ length: 20 }, (_, i) => ({ ...note, id: i + 1, comments: [{ ...note, id: i + 100 }] })));
  });
  const result = mrNotes.output.parse(await rpc(mrNotes, { ...ref, page: 2 }));
  assert(result.ok); assert.equal(result.nextPage, 3); assert(result.truncated);
  assert.equal(result.items.length, 40); assert.equal(result.items[0].body.length, 20000);
  assert(result.items.reduce((n, item) => n + item.body.length, 0) <= 200000);
});

test("讨论非法分页头及非法嵌套结构不能冒充无评论", async () => {
  let response = Response.json([], { headers: { "X-Next-Page": "1" } });
  await connect(() => response);
  assert.deepEqual(await rpc(mrNotes, { ...ref, page: 1 }), { ok: false, error: "invalid_response" });
  response = Response.json([{ id: 1, body: "top", comments: [{ id: "bad", body: "broken" }] }]);
  assert.deepEqual(await rpc(mrNotes, { ...ref, page: 1 }), { ok: false, error: "invalid_response" });
});

test("账号变更时所有详情请求拒绝旧身份，私有上游异常不会透传", async () => {
  let calls = 0;
  await connect(() => { calls++; throw new Error("private secret"); });
  for (const contract of [mrDetail, mrChanges, mrReview]) assert.deepEqual(await rpc(contract, { ...ref, accountId: 8 }), { ok: false, error: "account_changed" });
  assert.deepEqual(await rpc(mrNotes, { ...ref, page: 1, accountId: 8 }), { ok: false, error: "account_changed" });
  assert.equal(calls, 0);
  assert.deepEqual(await rpc(mrDetail, ref), { ok: false, error: "network_error" });
});

test("错误MR身份不进入详情，项目链接加载失败保留有效描述", async () => {
  let correct = false;
  await connect(url => url.pathname === "/api/v3/projects/10" ? new Response("private", { status: 403 }) : Response.json({ ...mr, id: correct ? 100 : 2 }));
  assert.deepEqual(await rpc(mrDetail, ref), { ok: false, error: "invalid_response" });
  correct = true;
  const result = mrDetail.output.parse(await rpc(mrDetail, ref));
  assert(result.ok); assert.equal(result.detail.description, mr.description); assert.equal(result.detail.url, null);
});

test("深嵌套讨论到边界停止并标记截断，不递归无限响应", async () => {
  let nested: unknown = { id: 10, body: "last", comments: [] };
  for (let id = 9; id >= 1; id--) nested = { id, body: "reply", comments: [nested] };
  await connect(() => Response.json([nested]));
  const result = mrNotes.output.parse(await rpc(mrNotes, { ...ref, page: 1 }));
  assert(result.ok); assert(result.truncated); assert.equal(result.items.length, 6);
  assert.deepEqual(result.items.map(n => n.parentId), [null, 1, 2, 3, 4, 5]);
});
