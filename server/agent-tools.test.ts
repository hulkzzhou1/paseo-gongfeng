import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolContext, AgentToolDefinition, PluginHandlerContext } from "@getpaseo/plugin/server";
import { createGongfengService } from "./service.ts";
import { createGongfengAgentTools, registerGongfengTools } from "./agent-tools.ts";
import { bindRepository, listManagedRepositories, addManagedRepository, unbindRepository } from "../shared/repositories.ts";
import { issueDetail, saveIssueNote } from "../shared/issues.ts";
import { mrDetail } from "../shared/detail.ts";
import { listCloneOperations } from "../shared/clone.ts";

let home: string, previous: string | undefined, service: ReturnType<typeof createGongfengService>;
let context: AgentToolContext, tools: AgentToolDefinition[];
let respond: (url: URL, init: RequestInit) => Response | Promise<Response>;
let projectResponse: ((id: number) => Response | Promise<Response>) | undefined;
const siteUrl = "https://tools.example";
beforeEach(async () => {
  previous = process.env.PASEO_HOME; home = await mkdtemp(join(tmpdir(), "gongfeng-agent-tools-")); process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "tools-host");
  execFileSync("git", ["init", "--quiet", home]);
  execFileSync("git", ["-C", home, "remote", "add", "origin", "git@tools.example:Demo/Repo10.git"]);
  const paseo = {
    projects: { list: async () => ({ projects: [{ projectId: "local", projectRootPath: home, projectDisplayName: "Local" }] }) },
    workspaces: { list: async () => ({ entries: [], pageInfo: { hasMore: false, nextCursor: null } }) },
  } as unknown as PluginHandlerContext["paseo"];
  context = { paseo, signal: new AbortController().signal, agent: { id: "agent", workspaceId: "workspace", parentAgentId: null, provider: "codex", cwd: home, title: "Fixture" } };
  respond = () => { throw new Error("Unexpected upstream request"); };
  projectResponse = undefined;
  mock.method(globalThis, "fetch", async (value: string | URL | Request, init: RequestInit) => {
    const url = new URL(String(value)); assert.equal(url.origin, siteUrl);
    if (url.pathname === "/api/v3/user") return Response.json({ id: 7, username: "test", name: "Test" });
    if (/\/projects\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split("/").at(-1)); return projectResponse ? projectResponse(id) : Response.json({ id, name: `Repo${id}`, path_with_namespace: `Demo/Repo${id}` });
    }
    return respond(url, init);
  });
  service = createGongfengService();
  assert((await service.api.save("fictional-private-token", siteUrl)).ok);
  assert((await service.execute(bindRepository, { repositoryId: 10, projectId: "local" }, context) as { ok: boolean }).ok);
  tools = createGongfengAgentTools(service, { key: (await service.api.configurationKey())!, siteUrl, active: () => true });
});
afterEach(async () => {
  service.dispose(); mock.restoreAll();
  if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
  await rm(home, { recursive: true, force: true });
});
async function call(name: string, input: unknown, confirm?: boolean, caller = context) {
  const tool = tools.find(t => t.name === `gongfeng_${name}`); assert(tool);
  return tool.execute(tool.input.parse({ input, ...(confirm === undefined ? {} : { confirm }) }), caller);
}

test("initial settings read failure cannot overwrite a newer enabled subscription", async () => {
  let fail!: (reason: Error) => void, notify!: (state: unknown) => void, hook: any;
  const controller = registerGongfengTools({
    registerSettings() { return { read: () => new Promise((_resolve, reject) => { fail = reject; }), subscribe(fn: typeof notify) { notify = fn; return () => {}; } }; },
    before(name: string, fn: any) { assert.equal(name, "agent.session_open"); hook = fn; return () => {}; },
  } as any, service);
  try {
    notify({ status: "ready", values: { enabled: true } }); fail(new Error("Delayed initial read failed"));
    await controller.ready;
    const request = { cwd: home, tools: [], purpose: "interactive" };
    assert((await hook({ request }, context)).tools.some((t: AgentToolDefinition) => t.name === "gongfeng_list_repositories"));
  } finally { controller.dispose(); }
});

test("35 namespaced tools keep strict schemas, UI RPC results and credentials private", async () => {
  assert.equal(tools.length, 35); assert.equal(new Set(tools.map(t => t.name)).size, 35);
  assert(tools.every(t => /^gongfeng_[a-z0-9_]+$/.test(t.name)));
  assert(!tools.some(t => /settings|save_connection|arbitrary_rpc/.test(t.name)));
  assert.deepEqual((await call("list_repositories", {})).structuredContent, { result: await service.execute(listManagedRepositories, {}) });
  await assert.rejects(call("list_repositories", { token: "must-not-accept" }));
  await assert.rejects(call("add_repository", { repositoryId: 20 }));
  assert.deepEqual(await service.execute(listManagedRepositories, {}), { ok: true, items: [{ id: 10, name: "Repo10", path: "Demo/Repo10" }] });
  assert.equal((await call("add_repository", { repositoryId: 20 }, true)).isError, undefined);
  const wrongHost = await call("bind_repository", { repositoryId: 20, projectId: "other-host" }, true);
  assert.deepEqual(wrongHost.structuredContent, { result: { ok: false, error: "project_missing" } });
  assert.equal(wrongHost.isError, true);
  assert.equal((await call("list_repositories", { siteUrl: "https://other.example" })).isError, true);
  assert(!JSON.stringify([tools, wrongHost, await call("connection_status", {})]).includes("fictional-private-token"));
});

test("issue reads, confirmed edits and own comments share RPC revisions and author checks", async () => {
  let issue = { id: 100, iid: 2, project_id: 10, title: "Issue", description: "## Plan", state: "opened", confidential: true, author: { id: 8, username: "other", name: "Other" }, assignees: [], labels: [], milestone: null, priority: "P1", updated_at: "1" };
  let note = { id: 20, body: "Posted", system: false, author: { id: 7, username: "test", name: "Test" } }, writes = 0;
  respond = (url, init) => {
    if (init.method !== "GET") {
      writes++; const body = JSON.parse(String(init.body));
      if (url.pathname.includes("/notes")) note = { ...note, body: body.body }; else issue = { ...issue, ...body };
    }
    return Response.json(url.pathname.includes("/notes") ? note : issue);
  };
  const ref = { accountId: 7, projectId: 10, issueId: 100 };
  const detail = issueDetail.output.parse(await service.execute(issueDetail, ref)); assert(detail.ok);
  assert.deepEqual((await call("get_issue", ref)).structuredContent, { result: detail });
  const input = { ...ref, revision: detail.issue.revision, title: "Updated" };
  await assert.rejects(call("save_issue", input)); assert.equal(writes, 0);
  assert.deepEqual((await call("save_issue", input, true)).structuredContent, { result: await service.execute(issueDetail, ref) }); assert.equal(writes, 1);
  assert.equal((await call("save_issue", input, true)).isError, true); assert.equal(writes, 1);
  const posted = await call("save_issue_note", { ...ref, body: "Posted" }, true);
  const result = saveIssueNote.output.parse((posted.structuredContent as { result: unknown }).result); assert(result.ok); assert.equal(writes, 2);
  assert.equal((await call("save_issue_note", { ...ref, noteId: 20, revision: result.note.revision, body: "Edited" }, true)).isError, undefined); assert.equal(writes, 3);
  note.author.id = 8;
  assert.equal((await call("save_issue_note", { ...ref, noteId: 20, revision: result.note.revision, body: "Denied" }, true)).isError, true); assert.equal(writes, 3);
});

test("MR state tool requires confirmation and rejects stale state without repeating writes", async () => {
  let state = "opened", revision = 1, writes = 0;
  respond = (url, init) => {
    assert.equal(url.pathname, "/api/v3/projects/10/merge_request/100");
    if (init.method === "PUT") { writes++; state = "closed"; revision++; }
    return Response.json({ id: 100, iid: 5, title: "Fixture", state, source_project_id: 42, target_project_id: 10, source_branch: "feature", target_branch: "main", source_commit: "a".repeat(40), updated_at: String(revision) });
  };
  const ref = { siteUrl, accountId: 7, projectId: 10, mrId: 100 };
  const before = mrDetail.output.parse(await service.execute(mrDetail, ref)); assert(before.ok);
  const input = { ...ref, revision: before.detail.stateRevision, event: "close" };
  await assert.rejects(call("change_merge_request_state", input)); assert.equal(writes, 0);
  const result = await call("change_merge_request_state", input, true);
  const current = mrDetail.output.parse(await service.execute(mrDetail, ref)); assert(current.ok);
  assert.deepEqual(result.structuredContent, { result: { ok: true, current: current.detail } }); assert.equal(writes, 1);
  assert.equal((await call("change_merge_request_state", input, true)).isError, true); assert.equal(writes, 1);
});

test("session tools preserve other settings, ignore history and revoke on disable, rotation or stop", async () => {
  let notify!: (state: any) => void, hook: any, removed = false;
  const controller = registerGongfengTools({
    registerSettings(definition: any) { assert.equal(definition.id, "mcp"); return { read: async () => ({ status: "ready", values: { enabled: false } }), subscribe(fn: typeof notify) { notify = fn; return () => {}; } }; },
    before(name: string, fn: any) { assert.equal(name, "agent.session_open"); hook = fn; return () => { removed = true; }; },
  } as any, service);
  const request = { cwd: home, purpose: "interactive", tools: [{ ...tools[0], name: "other_tool" }], env: { KEEP: "unchanged" }, labels: {} };
  const snapshot = JSON.stringify(request);
  try {
    await controller.ready; assert.equal(await hook({ request }, context), request);
    notify({ status: "ready", values: { enabled: true } });
    const history = { ...request, purpose: "history" }; assert.equal(await hook({ request: history }, context), history);
    const attached = await hook({ request }, context); assert.equal(attached.tools.length, 36);
    assert.equal(attached.tools[0], request.tools[0]); assert.deepEqual(attached.env, request.env); assert.equal(JSON.stringify(request), snapshot);
    const tool: AgentToolDefinition = attached.tools.find((t: AgentToolDefinition) => t.name === "gongfeng_list_repositories");
    const args = tool.input.parse({ input: {} }); assert.equal((await tool.execute(args, context)).isError, undefined);
    notify({ status: "ready", values: { enabled: false } });
    assert.equal((await tool.execute(args, context)).isError, true); assert.equal(await hook({ request }, context), request);
    notify({ status: "ready", values: { enabled: true } });
    const next = (await hook({ request }, context)).tools.find((t: AgentToolDefinition) => t.name === tool.name);
    assert.equal((await next.execute(args, context)).isError, undefined);
    assert((await service.api.save("rotated-fictional-token", siteUrl)).ok);
    assert.equal((await next.execute(args, context)).isError, true);
    controller.dispose(); assert(removed); assert.equal(await hook({ request }, context), request);
  } finally { controller.dispose(); }
});

test("each call uses its own Agent context and refuses removed associations", async () => {
  assert.equal((await call("list_repositories", {}, undefined, { ...context, agent: { ...context.agent, cwd: join(home, "missing") } })).isError, true);
  assert.equal((await call("list_repositories", {})).isError, undefined);
  assert((await service.execute(unbindRepository, { repositoryId: 10, projectId: "local" }, context) as { ok: boolean }).ok);
  assert.equal((await call("list_repositories", {})).isError, true);
});

test("RPC and tools share the write queue; canceled pending tools cannot add a repository", async () => {
  let entered!: () => void, release!: () => void;
  const blocked = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const requested: number[] = [];
  projectResponse = async id => {
    requested.push(id); if (id === 20) { entered(); await gate; }
    return Response.json({ id, name: `Repo${id}`, path_with_namespace: `Demo/Repo${id}` });
  };
  const rpc = service.execute(addManagedRepository, { repositoryId: 20 }); await blocked;
  const abort = new AbortController();
  const canceled = call("add_repository", { repositoryId: 30 }, true, { ...context, signal: abort.signal });
  const queued = call("add_repository", { repositoryId: 40 }, true);
  try {
    await new Promise(r => setTimeout(r, 50)); assert(!requested.includes(30)); abort.abort();
  } finally { release(); }
  assert((await rpc as { ok: boolean }).ok); assert.equal((await canceled).isError, true);
  assert.equal((await queued).isError, undefined);
  const listed = listManagedRepositories.output.parse(await service.execute(listManagedRepositories, {})); assert(listed.ok); assert.deepEqual(listed.items.map(r => r.id), [10, 20, 40]); assert(!requested.includes(30));
  assert.equal((await call("add_repository", { repositoryId: 30 }, true)).isError, undefined);
});

test("a tool queued behind credential rotation cannot write using the former identity", async () => {
  let entered!: () => void, release!: () => void;
  const blocked = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const holding = service.api.exclusive(async () => { entered(); await gate; }); await blocked;
  const saving = service.api.save("new-fictional-token", siteUrl);
  const queued = call("add_repository", { repositoryId: 20 }, true);
  try { await new Promise(r => setTimeout(r, 50)); } finally { release(); }
  await holding; assert((await saving).ok); assert.equal((await queued).isError, true);
  const listed = listManagedRepositories.output.parse(await service.execute(listManagedRepositories, {})); assert(listed.ok); assert.deepEqual(listed.items.map(r => r.id), [10]);
});

test("an in-flight canceled request aborts upstream without retrying or exposing upstream errors", async () => {
  let entered!: () => void, requests = 0;
  const blocked = new Promise<void>(r => { entered = r; });
  respond = (_url, init) => new Promise((_resolve, reject) => {
    requests++; entered(); init.signal!.addEventListener("abort", () => reject(new Error("fictional-private-token")), { once: true });
  });
  const abort = new AbortController(), result = call("get_issue", { accountId: 7, projectId: 10, issueId: 100 }, undefined, { ...context, signal: abort.signal });
  await blocked; abort.abort(); const value = await result;
  assert.equal(value.isError, true); assert.equal(requests, 1); assert(!JSON.stringify(value).includes("fictional-private-token"));
});

test("a queued tool rechecks association after an earlier UI unbind commits", async () => {
  let entered!: () => void, release!: () => void;
  const blocked = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const holding = service.api.exclusive(async () => { entered(); await gate; }); await blocked;
  const unbind = service.execute(unbindRepository, { repositoryId: 10, projectId: "local" }, context);
  const queued = call("add_repository", { repositoryId: 20 }, true);
  try { await new Promise(r => setTimeout(r, 100)); } finally { release(); }
  await holding; assert((await unbind as { ok: boolean }).ok);
  assert.equal((await queued).isError, true);
  const listed = listManagedRepositories.output.parse(await service.execute(listManagedRepositories, {})); assert(listed.ok); assert.deepEqual(listed.items.map(r => r.id), [10]);
});

test("canceling after clone metadata arrives cannot create its target or launch Git", async () => {
  const abort = new AbortController(), targetPath = join(home, "canceled-clone"), bin = join(home, "bin"), marker = join(home, "clone-started");
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const previousPath = process.env.PATH; await mkdir(bin);
  await writeFile(join(bin, "git"), `#!/usr/bin/env node\nconst cp=require('node:child_process');if(process.argv.includes('clone')){require('node:fs').writeFileSync(${JSON.stringify(marker)},'started');process.exit(1);}const r=cp.spawnSync(${JSON.stringify(git)},process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);\n`, { mode: 0o700 });
  process.env.PATH = `${bin}:${previousPath}`;
  projectResponse = id => {
    const response = Response.json({ id, name: `Repo${id}`, path_with_namespace: `Demo/Repo${id}` });
    if (id === 20) { const text = response.text.bind(response); response.text = async () => { const body = await text(); abort.abort(); return body; }; }
    return response;
  };
  try {
    assert.equal((await call("clone_repository", { repositoryId: 20, targetPath }, true, { ...context, signal: abort.signal })).isError, true);
    await assert.rejects(lstat(targetPath), { code: "ENOENT" }); await assert.rejects(lstat(marker), { code: "ENOENT" });
  } finally { if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; }
});

test("canceling a completed local clone retains its record without launching project registration", async () => {
  const abort = new AbortController(), targetPath = join(home, "cloned"), bin = join(home, "bin"), marker = join(home, "registered");
  const git = execFileSync("which", ["git"], { encoding: "utf8" }).trim(), previousPath = process.env.PATH;
  execFileSync(git, ["-C", home, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
  await mkdir(bin);
  await writeFile(join(bin, "git"), `#!/usr/bin/env node\nconst cp=require('node:child_process');const git=${JSON.stringify(git)};const args=process.argv.slice(2);if(args.includes('clone')){cp.execFileSync(git,['-c','core.hooksPath=/dev/null','clone','--template=','--',${JSON.stringify(home)},args.at(-1)],{stdio:'ignore'});cp.execFileSync(git,['-C',args.at(-1),'remote','set-url','origin','git@tools.example:Demo/Repo20.git']);}else{const r=cp.spawnSync(git,args,{stdio:'inherit'});process.exit(r.status??1);}\n`, { mode: 0o700 });
  await writeFile(join(bin, "paseo"), `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'registered');process.exit(1);\n`, { mode: 0o700 });
  const projects = context.paseo.projects.list.bind(context.paseo.projects);
  mock.method(context.paseo.projects, "list", async () => {
    if (await lstat(targetPath).then(() => true, () => false)) abort.abort();
    return projects();
  });
  process.env.PATH = `${bin}:${previousPath}`;
  try {
    assert.equal((await call("clone_repository", { repositoryId: 20, targetPath }, true, { ...context, signal: abort.signal })).isError, true);
    assert((await lstat(targetPath)).isDirectory()); await assert.rejects(lstat(marker), { code: "ENOENT" });
    const records = listCloneOperations.output.parse(await service.execute(listCloneOperations, {})); assert(records.ok); assert.equal(records.operations[0].stage, "cloned");
  } finally { if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; }
});
