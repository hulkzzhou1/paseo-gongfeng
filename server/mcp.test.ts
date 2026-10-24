import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createGongfengService } from "./service.ts";
import { startMcpEndpoint } from "./mcp-http.ts";
import { legacySite } from "../shared/site.ts";
import { listManagedRepositories } from "../shared/repositories.ts";

test("标准MCP发现已添加仓库工具，结果与UI RPC一致且不暴露连接保存", async () => {
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-"));
  const previous = process.env.PASEO_HOME; process.env.PASEO_HOME = home;
  const service = createGongfengService();
  let endpoint: Awaited<ReturnType<typeof startMcpEndpoint>> | undefined;
  const client = new Client({ name: "gongfeng-test", version: "1" });
  try {
    await writeFile(join(home, "server-id"), "fictional-daemon");
    endpoint = await startMcpEndpoint(service, { key: null, siteUrl: legacySite });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.config.url), { requestInit: { headers: endpoint.config.headers } }));
    assert.equal((await fetch(endpoint.config.url, { method: "POST" })).status, 401);
    assert.equal((await fetch(endpoint.config.url, { method: "POST", headers: { ...endpoint.config.headers, Origin: "https://untrusted.example" } })).status, 403);
    const tools = await client.listTools();
    assert(tools.tools.some(t => t.name === "list_repositories" && t.annotations?.readOnlyHint));
    assert(!tools.tools.some(t => /connection.save|token|rpc/.test(t.name)));
    const rpc = await service.execute(listManagedRepositories, {});
    const result = await client.callTool({ name: "list_repositories", arguments: { input: {} } });
    assert.deepEqual(result.structuredContent, { result: rpc });
    assert.deepEqual(rpc, { ok: true, items: [] });
  } finally {
    await client.close(); await endpoint?.close(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("创建Hook默认不注入，开启后保留已有配置，轮换／关闭停止服务但不改旧Agent配置", async () => {
  const { mock } = await import("node:test");
  const { registerGongfengMcp } = await import("./mcp.ts");
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-hook-")), previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "fictional-daemon");
  const service = createGongfengService();
  let notify!: (state: any) => Promise<void>, hook: any, removed = false;
  const controller = registerGongfengMcp({
    registerSettings() { return { read: async () => ({ status: "ready", revision: "test", values: { enabled: false } }), subscribe(fn: any) { notify = fn; return () => {}; } }; },
    before(name: string, fn: any) { assert.equal(name, "agent.create"); hook = fn; return () => { removed = true; }; },
    handle() {},
  } as any, service);
  const { execFileSync } = await import("node:child_process");
  const { mkdir } = await import("node:fs/promises");
  const { bindRepository } = await import("../shared/repositories.ts");
  const repoRoot = join(home, "repo"); await mkdir(repoRoot);
  execFileSync("git", ["init", "--quiet", repoRoot]); execFileSync("git", ["-C", repoRoot, "remote", "add", "origin", "git@first.example:Demo/Repo.git"]);
  const context = { paseo: {
    projects: { list: async () => ({ projects: [{ projectId: "bound", projectRootPath: repoRoot, projectDisplayName: "Repo" }] }) },
    workspaces: { list: async () => ({ entries: [], pageInfo: { hasMore: false, nextCursor: null } }) },
  } } as any;
  const upstream = (accountId: number) => async (value: any) => new URL(String(value)).pathname === "/api/v3/user" ? Response.json({ id: accountId, username: "test", name: "Test" }) : Response.json({ id: 10, name: "Repo", path_with_namespace: "Demo/Repo" });
  const existing = { search: { type: "http", url: "https://search.example/mcp" } };
  const request = { config: { provider: "codex", cwd: repoRoot, model: "fixture", mcpServers: existing, providerOptions: { approval_policy: "on-request" } }, env: { KEEP: "unchanged" } };
  const unchanged = JSON.stringify(request);
  const client = new Client({ name: "hook-test", version: "1" });
  try {
    await controller.ready; assert.equal(typeof hook, "function");
    assert.equal(await hook({ request }, context), request);
    await notify({ status: "ready", revision: "on", values: { enabled: true } });
    assert.equal(await hook({ request }, context), request); // Not configured yet.
    mock.method(globalThis, "fetch", upstream(7));
    assert((await service.api.save("fictional-token", "https://first.example")).ok);
    assert((await service.execute(bindRepository, { repositoryId: 10, projectId: "bound" }, context) as any).ok);
    const created = await hook({ request }, context), old = created.config.mcpServers["gongfeng-workbench"];
    assert.equal(old.type, "http"); assert.equal(JSON.stringify(request), unchanged);
    assert.deepEqual(created.config.mcpServers.search, existing.search);
    assert.deepEqual(created.config.providerOptions, request.config.providerOptions);
    assert.equal(created.config.cwd, repoRoot); assert.equal(created.config.model, "fixture"); assert.deepEqual(created.env, request.env);
    assert(!JSON.stringify(created).includes("fictional-token"));
    const collision = { ...request, config: { ...request.config, mcpServers: { "gongfeng-workbench": existing.search } } };
    assert.equal(await hook({ request: collision }, context), collision);
    mock.restoreAll();
    await client.connect(new StreamableHTTPClientTransport(new URL(old.url), { requestInit: { headers: old.headers } }));
    assert.equal((await client.listTools()).tools.length, 27);
    mock.method(globalThis, "fetch", upstream(8));
    assert((await service.api.save("second-fictional-token", "https://second.example")).ok);
    assert.equal(await hook({ request }, context), request); // A different site needs its own association.
    execFileSync("git", ["-C", repoRoot, "remote", "set-url", "origin", "git@second.example:Demo/Repo.git"]);
    assert((await service.execute(bindRepository, { repositoryId: 10, projectId: "bound" }, context) as any).ok);
    const next = (await hook({ request }, context)).config.mcpServers["gongfeng-workbench"];
    assert.notEqual(next.url, old.url); assert.notEqual(next.headers.authorization, old.headers.authorization);
    assert.equal(created.config.mcpServers["gongfeng-workbench"].url, old.url);
    mock.restoreAll(); await assert.rejects(client.listTools());
    await notify({ status: "ready", revision: "off", values: { enabled: false } });
    assert.equal(await hook({ request }, context), request); await assert.rejects(fetch(next.url));
    assert.equal(created.config.mcpServers["gongfeng-workbench"].url, old.url);
    await controller.dispose(); assert(removed);
  } finally {
    mock.restoreAll(); await client.close(); await controller.dispose(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("写工具需明确确认，仓库与本地项目关联复用RPC并拒绝跨host项目", async () => {
  const { mock } = await import("node:test");
  const { execFileSync } = await import("node:child_process");
  const { addManagedRepository, listRepositoryBindings } = await import("../shared/repositories.ts");
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-bind-")), previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "fictional-daemon");
  const service = createGongfengService(), client = new Client({ name: "binding-test", version: "1" });
  let endpoint: Awaited<ReturnType<typeof startMcpEndpoint>> | undefined;
  const fetchOriginal = globalThis.fetch;
  const projects = [{ projectId: "local-owned", projectRootPath: home, projectDisplayName: "Local" }];
  service.setHostContext({ paseo: { projects: { list: async () => ({ projects }) } } } as any);
  try {
    execFileSync("git", ["init", "--quiet", home]); execFileSync("git", ["-C", home, "remote", "add", "origin", "git@first.example:Demo/Repo.git"]);
    mock.method(globalThis, "fetch", async (input: any, init: any) => {
      const url = new URL(String(input));
      if (url.hostname === "127.0.0.1") return fetchOriginal(input, init);
      assert.equal(url.origin, "https://first.example"); assert.equal(init.method, "GET");
      if (url.pathname.endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
      assert.equal(url.pathname, "/api/v3/projects/10"); return Response.json({ id: 10, path_with_namespace: "Demo/Repo", name: "Repo" });
    });
    assert((await service.api.save("fictional-token", "https://first.example")).ok);
    endpoint = await startMcpEndpoint(service, { key: await service.api.configurationKey(), siteUrl: "https://first.example" });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.config.url), { requestInit: { headers: endpoint.config.headers } }));
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 27);
    for (const name of ["add_repository", "bind_repository", "unbind_repository", "clone_repository", "save_reviewers", "submit_review", "change_merge_request_state", "save_milestone", "delete_milestone", "save_milestone_links"]) {
      assert.equal(tools.find(t => t.name === name)?.annotations?.readOnlyHint, false);
      await assert.rejects(client.callTool({ name, arguments: { input: {} } }));
    }
    await assert.rejects(client.callTool({ name: "connection_status", arguments: { input: { token: "not-an-input" } } }));
    assert.equal(tools.find(t => t.name === "bind_repository")?.annotations?.readOnlyHint, false);
    assert.equal(tools.find(t => t.name === "delete_milestone")?.annotations?.destructiveHint, true);
    assert(!tools.some(t => /settings|save_connection|agent/.test(t.name)));
    await assert.rejects(client.callTool({ name: "add_repository", arguments: { input: { repositoryId: 10 } } }));
    await assert.rejects(client.callTool({ name: "arbitrary_rpc", arguments: { input: {} } }));
    await assert.rejects(client.callTool({ name: "list_repositories", arguments: { input: { token: "must-not-accept" } } }));
    const added = await client.callTool({ name: "add_repository", arguments: { confirm: true, input: { repositoryId: 10 } } });
    assert.deepEqual(added.structuredContent, { result: await service.execute(addManagedRepository, { siteUrl: "https://first.example", repositoryId: 10 }) });
    const listed = await client.callTool({ name: "list_repositories", arguments: { input: {} } });
    assert.deepEqual(listed.structuredContent, { result: { ok: true, items: [{ id: 10, path: "Demo/Repo", name: "Repo" }] } });
    const wrong = await client.callTool({ name: "bind_repository", arguments: { confirm: true, input: { projectId: "other-host-project", repositoryId: 10 } } });
    assert.deepEqual(wrong.structuredContent, { result: { ok: false, error: "project_missing" } });
    const bound = await client.callTool({ name: "bind_repository", arguments: { confirm: true, input: { projectId: "local-owned", repositoryId: 10 } } });
    assert.equal(bound.isError, undefined);
    const bindings = await client.callTool({ name: "list_repository_bindings", arguments: { input: { repositoryId: 10 } } });
    assert.deepEqual(bindings.structuredContent, { result: await service.execute(listRepositoryBindings, { siteUrl: "https://first.example", repositoryId: 10 }) });
    const stale = await client.callTool({ name: "list_repositories", arguments: { input: { siteUrl: "https://different.example" } } });
    assert.equal(stale.isError, true);
    assert(!JSON.stringify([tools, added, bindings, stale]).includes("fictional-token"));
    await client.callTool({ name: "unbind_repository", arguments: { confirm: true, input: { projectId: "local-owned", repositoryId: 10 } } });
    const afterUnbind = listRepositoryBindings.output.parse(await service.execute(listRepositoryBindings, {}));
    assert(afterUnbind.ok); assert.deepEqual(afterUnbind.bindings, []);
  } finally {
    mock.restoreAll(); await client.close(); await endpoint?.close(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("RPC占用写队列时MCP写入等待，两个仓库记录均保留", async () => {
  const { mock } = await import("node:test");
  const { addManagedRepository } = await import("../shared/repositories.ts");
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-queue-")), previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home; await writeFile(join(home, "server-id"), "queue-daemon");
  const service = createGongfengService(), client = new Client({ name: "queue-test", version: "1" });
  let endpoint: Awaited<ReturnType<typeof startMcpEndpoint>> | undefined;
  let entered!: () => void, release!: () => void;
  const blocked = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const fetchOriginal = globalThis.fetch, requested: number[] = [];
  try {
    mock.method(globalThis, "fetch", async (input: any, init: any) => {
      const url = new URL(String(input));
      if (url.hostname === "127.0.0.1") return fetchOriginal(input, init);
      assert.equal(url.origin, "https://queue.example"); assert.equal(init.method, "GET");
      if (url.pathname.endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
      const id = Number(url.pathname.split("/").at(-1)); requested.push(id);
      if (id === 10) { entered(); await gate; }
      return Response.json({ id, path_with_namespace: `Demo/Repo${id}`, name: `Repo${id}` });
    });
    assert((await service.api.save("fictional-token", "https://queue.example")).ok);
    endpoint = await startMcpEndpoint(service, { key: await service.api.configurationKey(), siteUrl: "https://queue.example" });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.config.url), { requestInit: { headers: endpoint.config.headers } }));
    const rpc = service.execute(addManagedRepository, { repositoryId: 10 }); await blocked;
    let finished = false;
    const mcp = client.callTool({ name: "add_repository", arguments: { input: { repositoryId: 20 }, confirm: true } }).then(r => { finished = true; return r; });
    await new Promise(r => setTimeout(r, 100)); assert.equal(finished, false); assert.deepEqual(requested, [10]);
    release(); assert.deepEqual(await rpc, { ok: true, repository: { id: 10, path: "Demo/Repo10", name: "Repo10" } });
    assert.equal((await mcp).isError, undefined);
    const result = listManagedRepositories.output.parse(await service.execute(listManagedRepositories, {}));
    assert(result.ok); assert.deepEqual(result.items.map(item => item.id), [10, 20]);
  } finally {
    release(); mock.restoreAll(); await client.close(); await endpoint?.close(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("MCP合法写入排队期间切换凭据，释放后旧身份不能写入", async () => {
  const { mock } = await import("node:test");
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-stale-")), previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home; await writeFile(join(home, "server-id"), "stale-daemon");
  const service = createGongfengService(), client = new Client({ name: "stale-queue-test", version: "1" });
  let endpoint: Awaited<ReturnType<typeof startMcpEndpoint>> | undefined;
  let entered!: () => void, release!: () => void, switching = false, writes = 0;
  const blocked = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const fetchOriginal = globalThis.fetch;
  try {
    mock.method(globalThis, "fetch", async (input: any, init: any) => {
      const url = new URL(String(input));
      if (url.hostname === "127.0.0.1") return fetchOriginal(input, init);
      assert.equal(url.origin, "https://queue.example");
      if (url.pathname.endsWith("/user")) { if (switching) { entered(); await gate; } return Response.json({ id: switching ? 8 : 7, username: "test", name: "Test" }); }
      writes++; return Response.json({ id: 20, path_with_namespace: "Demo/Repo20", name: "Repo20" });
    });
    assert((await service.api.save("first-fictional-token", "https://queue.example")).ok);
    endpoint = await startMcpEndpoint(service, { key: await service.api.configurationKey(), siteUrl: "https://queue.example" });
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.config.url), { requestInit: { headers: endpoint.config.headers } }));
    switching = true;
    const save = service.api.save("second-fictional-token", "https://queue.example"); await blocked;
    let finished = false;
    const queued = client.callTool({ name: "add_repository", arguments: { input: { repositoryId: 20 }, confirm: true } }).then(r => { finished = true; return r; });
    await new Promise(r => setTimeout(r, 100)); assert.equal(finished, false); assert.equal(writes, 0);
    release(); assert((await save).ok);
    assert.equal((await queued).isError, true); assert.equal(writes, 0);
    assert.deepEqual(await service.execute(listManagedRepositories, {}), { ok: true, items: [] });
  } finally {
    release(); mock.restoreAll(); await client.close(); await endpoint?.close(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("创建Hook仅注入当前host/站点的有效关联项目，支持worktree和子目录且拒绝歧义", async () => {
  const { mock } = await import("node:test");
  const { execFileSync } = await import("node:child_process");
  const { mkdir, symlink } = await import("node:fs/promises");
  const { bindRepository, unbindRepository } = await import("../shared/repositories.ts");
  const { registerGongfengMcp } = await import("./mcp.ts");
  const home = await mkdtemp(join(tmpdir(), "gongfeng-mcp-project-")), previous = process.env.PASEO_HOME, previousId = process.env.PASEO_SERVER_ID;
  process.env.PASEO_HOME = home; process.env.PASEO_SERVER_ID = "hook-host";
  const repo = join(home, "repo"), other = join(home, "repo-unrelated"), nested = join(repo, "nested"), worktree = join(home, "worktree"), alias = join(home, "alias");
  await mkdir(nested, { recursive: true }); await mkdir(other); await mkdir(join(repo, "src"));
  execFileSync("git", ["init", "--quiet", repo]);
  execFileSync("git", ["-C", repo, "remote", "add", "origin", "git@scope.example:Demo/Repo.git"]);
  execFileSync("git", ["-C", repo, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture"]);
  execFileSync("git", ["-C", repo, "worktree", "add", "--quiet", "--detach", worktree, "HEAD"]); await symlink(repo, alias);
  const projects = [{ projectId: "bound", projectRootPath: repo, projectDisplayName: "Repo" }, { projectId: "other", projectRootPath: other, projectDisplayName: "Other" }, { projectId: "nested", projectRootPath: nested, projectDisplayName: "Nested" }];
  let ambiguous = false, unavailable = false, readDenied = false, hook: any;
  let sdkGate: Promise<void> | undefined, sdkEntered: (() => void) | undefined;
  const context = { paseo: {
    projects: { list: async () => ({ projects }) },
    workspaces: { list: async (options: any) => {
      if (unavailable) throw Error("SDK unavailable");
      if (sdkGate) { sdkEntered?.(); await sdkGate; }
      return options.page.cursor ? { entries: [{ projectId: "bound", workspaceDirectory: worktree }, ...(ambiguous ? [{ projectId: "other", workspaceDirectory: worktree }] : [])], pageInfo: { hasMore: false, nextCursor: null } }
        : { entries: [], pageInfo: { hasMore: true, nextCursor: "second-page" } };
    } },
  } } as any;
  const service = createGongfengService();
  const controller = registerGongfengMcp({
    registerSettings() { return { read: async () => ({ status: "ready", values: { enabled: true } }), subscribe() { return () => {}; } }; },
    before(name: string, fn: any) { assert.equal(name, "agent.create"); hook = fn; return () => {}; },
  } as any, service);
  async function receives(cwd: string) {
    const request = { config: { provider: "codex", cwd } };
    return !!(await hook({ request }, context)).config.mcpServers?.["gongfeng-workbench"];
  }
  try {
    mock.method(globalThis, "fetch", async (input: any) => {
      const url = new URL(String(input)); assert.equal(url.origin, "https://scope.example");
      if (url.pathname.endsWith("/user")) return Response.json({ id: 7, name: "Test", username: "test" });
      assert.equal(url.pathname, "/api/v3/projects/10");
      return readDenied ? new Response(null, { status: 403 }) : Response.json({ id: 10, name: "Repo", path_with_namespace: "Demo/Repo" });
    });
    await controller.ready; assert((await service.api.save("fictional-token", "https://scope.example")).ok);
    assert.equal(await receives(repo), false); // A matching remote is not an explicit project association.
    assert((await service.execute(bindRepository, { repositoryId: 10, projectId: "bound" }, context) as any).ok);
    assert.equal(await receives(repo), true); assert.equal(await receives(join(repo, "src")), true); assert.equal(await receives(alias), true);
    assert.equal(await receives(other), false); assert.equal(await receives(nested), false);
    assert.equal(await receives(worktree), true); // Its SDK ownership is on the second page.
    ambiguous = true; assert.equal(await receives(worktree), false); ambiguous = false;
    unavailable = true; assert.equal(await receives(repo), false); unavailable = false;
    readDenied = true; assert.equal(await receives(repo), false); readDenied = false;
    process.env.PASEO_SERVER_ID = "other-host"; assert.equal(await receives(repo), false); process.env.PASEO_SERVER_ID = "hook-host";
    execFileSync("git", ["-C", repo, "remote", "set-url", "origin", "git@scope.example:Other/Repo.git"]);
    assert.equal(await receives(repo), false);
    execFileSync("git", ["-C", repo, "remote", "set-url", "origin", "git@scope.example:Demo/Repo.git"]);
    let release!: () => void;
    const entered = new Promise<void>(resolve => { sdkEntered = resolve; });
    sdkGate = new Promise<void>(resolve => { release = resolve; });
    const creating = receives(repo); await entered;
    try { assert((await service.api.save("rotated-fictional-token", "https://scope.example")).ok); } finally { release(); }
    assert.equal(await creating, false); sdkGate = undefined;
    assert.equal(await receives(repo), true);
    assert((await service.execute(unbindRepository, { projectId: "bound", repositoryId: 10 }, context) as any).ok);
    assert.equal(await receives(repo), false);
  } finally {
    mock.restoreAll(); await controller.dispose(); service.dispose();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    if (previousId === undefined) delete process.env.PASEO_SERVER_ID; else process.env.PASEO_SERVER_ID = previousId;
    await rm(home, { recursive: true, force: true });
  }
});
