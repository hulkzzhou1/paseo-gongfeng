import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createPaseoApi } from "@getpaseo/client";
import { WorkspaceCreateRequestSchema, AgentCreateRequestSchema } from "@getpaseo/protocol/messages";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { bindRepository } from "../shared/repositories.ts";
import { saveConnection } from "../shared/connection.ts";
import { prepareReview, startReview, reviewHistory } from "../shared/dispatch.ts";
let home: string, base: string, head: string, original: string; let env: NodeJS.ProcessEnv; let stop: () => void;
let handlers: Map<string, (input: unknown) => Promise<unknown>>;
let workspaceCreates: Record<string, unknown>[], agentCreates: Record<string, unknown>[];
let workspaces: Map<string, { id: string; projectId: string; directory: string }>, agents: Map<string, { id: string; workspaceId: string; cwd: string }>;
let projects: { projectId: string; projectDisplayName: string; projectRootPath: string }[];
let failAgent: boolean, failWorkspace: boolean, failAfterAgent: boolean, loseAgentEvents: boolean;
const profile = { id: "reviewer", name: "Review", provider: "codex", model: "test-model", modeId: "full-access", thinkingOptionId: "high", featureValues: { experimental: true }, notes: "Review carefully" };
const reference = { projectId: 12, mrId: 91 };

test("Review历史和操作恢复按站点隔离，相同账号与MR身份不会串用", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  await rpc(saveConnection, { siteUrl: "https://code.example", token: "other-site-token" });
  const history = await rpc(reviewHistory, reference); assert(history.ok); assert.equal(history.operations.length, 0);
  assert.deepEqual(await rpc(prepareReview, { ...reference, operationId: prepared.operation.id }), { ok: false, error: "operation_missing" });
  assert.deepEqual(await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" }), { ok: false, error: "operation_missing" });
  assert.equal(workspaceCreates.length, 0); assert.equal(agentCreates.length, 0);
  await rpc(saveConnection, { siteUrl: "https://git.woa.com" });
  const restored = await rpc(reviewHistory, reference); assert(restored.ok); assert.equal(restored.operations[0].id, prepared.operation.id);
});
const protocolHost = createPaseoApi({
  supportsBackgroundWorkspaces: () => false,
  fetchWorkspaces: async () => ({ entries: [...workspaces.values()].map(w => ({ id: w.id, projectId: w.projectId, workspaceDirectory: w.directory })), pageInfo: {} }),
  createWorkspace: async (input: Record<string, any>) => { WorkspaceCreateRequestSchema.parse({ ...input, type: "workspace.create.request", requestId: "test" }); return { workspace: { id: input.workspaceId } }; },
  createAgent: async (input: Record<string, any>) => { AgentCreateRequestSchema.parse({ ...input, type: "agent.create.request", requestId: "test" }); return { id: input.agentId }; },
} as never);
const binary = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
function git(args: string[]) { return execFileSync(binary, args, { encoding: "utf8" }).trim(); }
function handleWorkspace(id: string) { return { ...workspaces.get(id), id, refresh: async () => workspaces.get(id) ? { id, projectId: workspaces.get(id)!.projectId, workspaceDirectory: workspaces.get(id)!.directory } : null, agents: { create: async (input: Record<string, any>) => {
  await protocolHost.workspaces.ref(id).agents.create(input as never);
  agentCreates.push(input); if (failAgent) throw new Error("private provider error");
  const existing = agents.get(input.agentId); if (existing) return existing;
  const agent = { id: input.agentId, workspaceId: id, cwd: workspaces.get(id)!.directory }; agents.set(agent.id, agent); if (!loseAgentEvents) input.onEvent?.({ phase: "agent_ready", workspaceId: id, agentId: agent.id }); if (failAfterAgent) throw new Error("private unknown prompt outcome"); return agent;
} } }; }
function start() {
  handlers = new Map(); const paseo = { config: { get: async () => ({ config: { agentProfiles: [profile], secret: "must not escape" } }) }, projects: { list: async () => ({ projects }) }, workspaces: { ref: handleWorkspace, create: async (input: Record<string, any>) => { await protocolHost.workspaces.create(input as never); workspaceCreates.push(input); input.onEvent?.({ phase: "accepted", workspaceId: input.workspaceId, agentId: null }); if (failWorkspace) throw new Error("workspace creation rejected"); const workspace = { id: input.workspaceId, projectId: input.source.projectId, directory: input.source.path }; workspaces.set(workspace.id, workspace); input.onEvent?.({ phase: "workspace_ready", workspaceId: workspace.id, agentId: null }); return handleWorkspace(workspace.id); } }, agents: { ref: (id: string) => ({ refresh: async () => agents.has(id) ? { agent: agents.get(id) } : null }) } };
  const cleanup = contribute({ handle(contract, handler) { handlers.set(contract.name, input => Promise.resolve(handler(contract.input.parse(input), { paseo } as never))); } } as PluginServerContext); stop = () => { void cleanup(); };
}
async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown) { const fn = handlers.get(contract.name); assert(fn, `missing ${contract.name}`); return contract.output.parse(await fn(input)); }
function response(url: string) {
  if (url.endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
  if (url.endsWith("/changes")) return Response.json({ id: 91, iid: 3, source_project_id: 13, target_project_id: 12, source_branch: "feature", target_branch: "main", updated_at: "2026-01-01", files: [{ old_path: "code.txt", new_path: "code.txt", diff: "-before\n+after" }] });
  if (url.includes("/notes")) return Response.json([{ id: 1, body: "untrusted discussion", author: { name: "Reviewer" } }], { headers: { "X-Next-Page": "" } });
  if (url.endsWith("/review")) return Response.json({ id: 999, reviewable_id: 91, reviewable_type: "merge_request", state: "open", reviewers: [] });
  if (url.endsWith("/merge_request/91")) return Response.json({ id: 91, iid: 3, title: "Review fixture", description: "untrusted description", state: "opened", source_project_id: 13, target_project_id: 12, source_branch: "feature", target_branch: "main", source_commit: head, target_commit: base, base_commit: base, updated_at: "2026-01-01" });
  const id = Number(url.split("/").pop()); return Response.json({ id, path_with_namespace: id === 13 ? "Fork/Sub/Repo" : "Group/Repo", name: "Repo" });
}
beforeEach(async () => {
  env = { ...process.env }; home = await mkdtemp(join(tmpdir(), "gongfeng-review-")); process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "srv_review_test"); await mkdir(join(home, "secrets/gongfeng-workbench"), { recursive: true, mode: 0o700 }); await writeFile(join(home, "secrets/gongfeng-workbench/private-token"), "test-only-token", { mode: 0o600 });
  original = join(home, "original"); await mkdir(original); git(["init", "-q", original]); await writeFile(join(original, "code.txt"), "before"); git(["-C", original, "add", "."]); git(["-C", original, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "base"]); base = git(["-C", original, "rev-parse", "HEAD"]); git(["-C", original, "remote", "add", "origin", "git@git.woa.com:Group/Repo.git"]);
  const fork = join(home, "fork"); git(["clone", "-q", original, fork]); await writeFile(join(fork, "code.txt"), "after"); git(["-C", fork, "add", "."]); git(["-C", fork, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "head"]); head = git(["-C", fork, "rev-parse", "HEAD"]); await writeFile(join(original, "code.txt"), "user dirty change");
  const bin = join(home, "bin"); await mkdir(bin); process.env.PATH = `${bin}:${env.PATH}`;
  await writeFile(join(bin, "git"), `#!/usr/bin/env node\nconst cp=require('node:child_process'),fs=require('node:fs');const args=process.argv.slice(2);if(args.includes('fetch')&&fs.existsSync(${JSON.stringify(join(home, "deny-git"))}))process.exit(1);const result=cp.spawnSync(${JSON.stringify(binary)},['-c',${JSON.stringify(`url.${original}.insteadOf=git@git.woa.com:Group/Repo.git`)},'-c',${JSON.stringify(`url.${fork}.insteadOf=git@git.woa.com:Fork/Sub/Repo.git`)},'-c','protocol.file.allow=always',...args],{stdio:'inherit'});process.exit(result.status??1);\n`, { mode: 0o700 });
  projects = [{ projectId: "project-a", projectDisplayName: "Repo", projectRootPath: original }]; workspaceCreates = []; agentCreates = []; workspaces = new Map(); agents = new Map(); failAgent = false; failWorkspace = false; failAfterAgent = false; loseAgentEvents = false;
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => response(String(url))); start(); await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
});
afterEach(async () => { stop?.(); mock.restoreAll(); for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); await rm(home, { recursive: true, force: true }); });
test("准备固定版本并应用完整预设，在所选项目独立目录启动一个Review", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); assert.deepEqual(prepared.projects.map(p => p.id), ["project-a"]); assert.equal(prepared.operation.sourceSha, head); assert(!JSON.stringify(prepared).includes("must not escape"));
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer", mode: "full", requirements: "检查调用方" }); assert(result.ok); assert.equal(result.operation.stage, "completed"); assert.equal(workspaceCreates.length, 1); assert.equal(agentCreates.length, 1);
  assert.equal(git(["-C", result.operation.directory!, "rev-parse", "HEAD"]), head); assert.equal(git(["-C", original, "rev-parse", "HEAD"]), base); assert.equal(await readFile(join(original, "code.txt"), "utf8"), "user dirty change");
  assert.deepEqual(agentCreates[0].config, { provider: "codex/test-model", modeId: "full-access", thinkingOptionId: "high", featureValues: { experimental: true } });
  assert.equal((workspaceCreates[0].source as Record<string, unknown>).kind, "directory"); assert.equal((workspaceCreates[0].source as Record<string, unknown>).projectId, "project-a"); assert(!JSON.stringify(agentCreates).includes("test-only-token"));
});

test("完整仓库模式不把整个 diff 注入 Agent，避免大 MR 超出派发输入", async () => {
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    const value = String(url); if (value.endsWith("/changes")) { const result = await response(value).json(); result.files[0].diff = "x".repeat(200000); return Response.json(result); } return response(value);
  });
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(result.ok);
  assert(String(agentCreates[0].prompt).length < 50000); assert(String(agentCreates[0].prompt).includes(head));
});

test("并发重复提交及插件重载后恢复不重复创建工作区或 Agent", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const input = { operationId: prepared.operation.id, profileId: "reviewer" };
  const results = await Promise.all([rpc(startReview, input), rpc(startReview, input)]); assert(results.every(r => r.ok));
  stop(); start(); const again = await rpc(startReview, input); assert(again.ok); assert.equal(workspaceCreates.length, 1); assert.equal(agentCreates.length, 1);
  const history = await rpc(reviewHistory, reference); assert(history.ok); assert.equal(history.operations[0].stage, "completed");
});

test("Agent 启动失败保留工作区，重载恢复同一工作区和固定版本", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const input = { operationId: prepared.operation.id, profileId: "reviewer" }; failAgent = true;
  const failed = await rpc(startReview, input); assert(!failed.ok); assert.equal(failed.error, "agent_failed"); assert(failed.operation?.workspaceId);
  stop(); start(); failAgent = false; const result = await rpc(startReview, input); assert(result.ok); assert.equal(result.operation.workspaceId, failed.operation.workspaceId); assert.equal(workspaceCreates.length, 1); assert.equal(agents.size, 1);
  assert.equal(agentCreates[0].agentId, agentCreates[1].agentId); assert.equal(agentCreates[0].idempotencyKey, agentCreates[1].idempotencyKey);
});

test("多个关联必须选择项目，remote 变化或配置更换不能静默改派", async () => {
  const second = join(home, "second"); git(["clone", "-q", original, second]); git(["-C", second, "remote", "set-url", "origin", "git@git.woa.com:Group/Repo.git"]);
  projects.push({ projectId: "project-b", projectDisplayName: "Second", projectRootPath: second }); await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" });
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); assert.equal(prepared.projects.length, 2);
  const required = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!required.ok); assert.equal(required.error, "project_required"); assert.equal(workspaceCreates.length, 0);
  git(["-C", second, "remote", "set-url", "origin", "git@git.woa.com:Group/Other.git"]);
  const invalid = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer", projectId: "project-b" }); assert(!invalid.ok); assert.equal(invalid.error, "binding_invalid");
});

test("Git 权限失败不自动降级，明确选择 diff 后使用独立空目录", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); await writeFile(join(home, "deny-git"), "yes");
  const failed = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!failed.ok); assert.equal(failed.error, "code_fetch_failed"); assert.equal(agentCreates.length, 0); assert(failed.operation?.canDowngrade);
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" }); assert(result.ok); assert.equal(result.operation.mode, "diff"); assert.notEqual(result.operation.directory, original); assert(String(agentCreates[0].prompt).includes("无完整仓库"));
});

test("恢复前发现独立目录 HEAD 被移动则阻止派发，不改原目录", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); failAgent = true;
  const failed = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!failed.ok); assert(failed.operation?.directory);
  git(["-C", failed.operation.directory, "checkout", "--detach", base]); failAgent = false;
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!result.ok); assert.equal(result.error, "directory_changed"); assert.equal(agents.size, 0);
});

test("MR 后续分支移动不改变已准备快照，原目录和系统 Git 配置不被继承", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const frozen = head;
  const fork = join(home, "fork"); await writeFile(join(fork, "code.txt"), "newer"); git(["-C", fork, "add", "."]); git(["-C", fork, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "moved"]); head = git(["-C", fork, "rev-parse", "HEAD"]);
  process.env.GIT_CONFIG_COUNT = "1"; process.env.GIT_CONFIG_KEY_0 = "core.bare"; process.env.GIT_CONFIG_VALUE_0 = "true";
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(result.ok); assert.equal(result.operation.sourceSha, frozen); delete process.env.GIT_CONFIG_COUNT; delete process.env.GIT_CONFIG_KEY_0; delete process.env.GIT_CONFIG_VALUE_0;
  assert.equal(git(["-C", result.operation.directory!, "rev-parse", "HEAD"]), frozen); assert.equal(await readFile(join(original, "code.txt"), "utf8"), "user dirty change");
});

test("工作区仅分配 ID 后失败可用同一身份重试，不误报资源已存在", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const input = { operationId: prepared.operation.id, profileId: "reviewer" }; failWorkspace = true;
  const failed = await rpc(startReview, input); assert(!failed.ok); assert.equal(workspaces.size, 0);
  stop(); start(); failWorkspace = false; const recovered = await rpc(startReview, input); assert(recovered.ok); assert.equal(workspaces.size, 1); assert.equal(workspaceCreates[0].workspaceId, workspaceCreates[1].workspaceId);
});

test("Agent 已创建但 prompt 结果不确定时保留入口，不能重发或新建", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const input = { operationId: prepared.operation.id, profileId: "reviewer" }; failAfterAgent = true;
  const failed = await rpc(startReview, input); assert(!failed.ok); assert(failed.operation?.agentId); assert.equal(agents.size, 1);
  stop(); start(); failAfterAgent = false; const result = await rpc(startReview, input); assert(!result.ok); assert.equal(result.error, "agent_outcome_unknown"); assert.equal(agentCreates.length, 1); assert.equal(result.operation?.agentId, failed.operation.agentId);
});

test("Agent 所有事件和响应丢失后恢复已有入口，持久保存且不重发", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  const input = { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" };
  failAfterAgent = true; loseAgentEvents = true;
  const failed = await rpc(startReview, input); assert(!failed.ok); assert.equal(failed.operation?.agentId, undefined);
  const agentId = [...agents.keys()][0]; assert(agentId);
  stop(); start(); failAfterAgent = false;
  const recovered = await rpc(startReview, input); assert(!recovered.ok); assert.equal(recovered.error, "agent_outcome_unknown");
  assert.equal(recovered.operation?.agentId, agentId); assert.equal(agentCreates.length, 1);
  stop(); start(); const history = await rpc(reviewHistory, reference); assert(history.ok);
  assert.equal(history.operations[0].agentId, agentId); assert.equal(history.operations[0].error, "agent_outcome_unknown");
  const repeated = await rpc(startReview, input); assert(!repeated.ok); assert.equal(repeated.operation?.agentId, agentId);
  assert.equal(agentCreates.length, 1); assert.equal(workspaceCreates.length, 1);
});

test("LFS 指针不是完整代码，必须报告限制且由用户选择 diff-only", async () => {
  const fork = join(home, "fork"); await writeFile(join(fork, ".gitattributes"), "*.dat filter=lfs diff=lfs merge=lfs -text\n"); await writeFile(join(fork, "asset.dat"), "version https://git-lfs.github.com/spec/v1\noid sha256:0000\nsize 4\n"); git(["-C", fork, "add", "."]); git(["-C", fork, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "lfs"]); head = git(["-C", fork, "rev-parse", "HEAD"]);
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!result.ok); assert.equal(result.error, "code_incomplete"); assert(result.operation?.canDowngrade); assert.equal(agentCreates.length, 0);
});

test("历史恢复窗口返回原快照和被冻结预设，不创建另一次 Review", async () => {
  const first = await rpc(prepareReview, reference); assert(first.ok);
  const restored = await rpc(prepareReview, { ...reference, operationId: first.operation.id }); assert(restored.ok); assert.equal(restored.operation.id, first.operation.id);
  assert(!JSON.stringify(restored.profiles).includes("experimental"));
  const history = await rpc(reviewHistory, reference); assert(history.ok); assert.equal(history.operations.length, 1);
});

test("切换账号后不能读取或恢复旧账号 Review，也不回显旧操作", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 8, username: "other", name: "Other" }) : response(String(url)));
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" }); assert(!result.ok); assert.equal(result.error, "account_changed"); assert.equal(result.operation, undefined);
  const history = await rpc(reviewHistory, reference); assert(history.ok); assert.equal(history.operations.length, 0);
});

test("已完成操作恢复也核对 Agent 目录和工作区归属", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok); const input = { operationId: prepared.operation.id, profileId: "reviewer" };
  const result = await rpc(startReview, input); assert(result.ok); agents.get(result.operation.agentId!)!.cwd = original;
  const repeated = await rpc(startReview, input); assert(!repeated.ok); assert.equal(repeated.error, "agent_changed"); assert.equal(agentCreates.length, 1);
});

test("大型仓库不收集完整文件路径，仍准确拒绝未获取的子模块", async () => {
  const fork = join(home, "fork");
  const blob = execFileSync(binary, ["-C", fork, "hash-object", "-w", "--stdin"], { input: "fixture", encoding: "utf8" }).trim();
  const entries = Array.from({ length: 10000 }, (_, index) => `100644 ${blob}\t${String(index).padStart(5, "0")}-${"a".repeat(220)}\n`).join("");
  execFileSync(binary, ["-C", fork, "update-index", "--index-info"], { input: `${entries}160000 ${base}\tnested-module\n`, encoding: "utf8" });
  const tree = git(["-C", fork, "write-tree"]);
  head = execFileSync(binary, ["-C", fork, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit-tree", tree, "-p", head], { input: "large tree", encoding: "utf8" }).trim();
  git(["-C", fork, "update-ref", "HEAD", head]);
  const oldListing = execFileSync(binary, ["-C", fork, "ls-tree", "-r", head], { maxBuffer: 4 * 1024 * 1024 });
  assert(oldListing.byteLength > 2 * 1024 * 1024);
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" });
  assert(!result.ok); assert.equal(result.error, "code_incomplete"); assert(result.operation?.canDowngrade);
  assert.equal(workspaceCreates.length, 0); assert.equal(agentCreates.length, 0);
});

test("旧版已持久化的非法工作区 ID 在无资源时稳定迁移并恢复", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  const input = { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" };
  failWorkspace = true; const failed = await rpc(startReview, input); assert(!failed.ok); assert.equal(failed.error, "workspace_failed");
  stop(); const file = join(home, "plugin-data/gongfeng-workbench/reviews.json");
  const records = JSON.parse(await readFile(file, "utf8")); const legacyId = "wks_0123456789abcdef0123456789abcdef"; records[0].expectedWorkspaceId = legacyId;
  await writeFile(file, JSON.stringify(records)); start(); failWorkspace = false;
  const result = await rpc(startReview, input); assert(result.ok); assert.equal(result.operation.workspaceId, "wks_0123456789abcdef");
  stop(); start(); const repeated = await rpc(startReview, input); assert(repeated.ok); assert.equal(repeated.operation.workspaceId, result.operation.workspaceId); assert.equal(workspaces.size, 1); assert.equal(agents.size, 1);
});

test("旧 ID 或派生 ID 已有工作区时拒绝迁移，不认领其他资源", async () => {
  for (const existingId of ["wks_0123456789abcdef0123456789abcdef", "wks_0123456789abcdef"]) {
    const prepared = await rpc(prepareReview, reference); assert(prepared.ok); stop();
    const file = join(home, "plugin-data/gongfeng-workbench/reviews.json"); const records = JSON.parse(await readFile(file, "utf8"));
    records.find((o: { id: string }) => o.id === prepared.operation.id).expectedWorkspaceId = "wks_0123456789abcdef0123456789abcdef";
    await writeFile(file, JSON.stringify(records)); workspaces.set(existingId, { id: existingId, directory: original, projectId: "project-a" }); start();
    const result = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" }); assert(!result.ok); assert.equal(result.error, "workspace_changed"); assert.equal(workspaceCreates.length, 0); assert.equal(agentCreates.length, 0);
    workspaces.clear();
  }
});

for (const field of ["workspaceId", "cwd"] as const) {
  test(`丢失 Agent 事件恢复时核对 ${field}，不暴露或重发归属不符的 Agent`, async () => {
    const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
    const input = { operationId: prepared.operation.id, profileId: "reviewer", mode: "diff" };
    failAfterAgent = true; loseAgentEvents = true;
    const failed = await rpc(startReview, input); assert(!failed.ok); assert.equal(failed.operation?.agentId, undefined);
    const agent = [...agents.values()][0]; agent[field] = "different-owner";
    stop(); start();
    const recovered = await rpc(startReview, input); assert(!recovered.ok); assert.equal(recovered.error, "agent_changed");
    assert.equal(recovered.operation?.agentId, undefined); assert.equal(agentCreates.length, 1);
  });
}

test("完整审查拒绝不可信源仓库路径，不启动宿主资源", async () => {
  const prepared = await rpc(prepareReview, reference); assert(prepared.ok);
  for (const path of ["../Other", "Group//Repo", "Group/./Repo", "git@outside.invalid:Repo", "Group/Repo;command"]) {
    mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/projects/13")
      ? Response.json({ id: 13, path_with_namespace: path, name: "Repo" }) : response(String(url)));
    const result: ReturnType<typeof startReview.output.parse> = await rpc(startReview, { operationId: prepared.operation.id, profileId: "reviewer" });
    assert(!result.ok); assert.equal(result.error, "code_fetch_failed");
    assert.equal(agentCreates.length, 0); assert.equal(workspaceCreates.length, 0);
  }
});
