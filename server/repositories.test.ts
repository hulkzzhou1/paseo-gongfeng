import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { trustedSshRemote } from "./repositories.ts";
import { addManagedRepository, listManagedRepositories, bindRepository, listRepositoryBindings, unbindRepository, searchRepositories } from "../shared/repositories.ts";
let home: string;
let oldHome: string | undefined;
let projects: { projectId: string; projectDisplayName: string; projectRootPath: string }[];
let handlers: Map<string, (input: unknown) => Promise<unknown>>;
let stop: () => void;
const remote = { id: 12, path_with_namespace: "Group/Sub/Repo", name: "Repo" };
function start() {
  handlers = new Map();
  const cleanup = contribute({ before() { return () => {}; }, registerSettings(definition) { return { read: async () => ({ status: "ready" as const, revision: "test", values: definition.schema.parse({}) }), subscribe: () => () => {} }; }, handle(contract, handler) { handlers.set(contract.name, (input) => Promise.resolve(handler(contract.input.parse(input), { paseo: { projects: { list: async () => ({ projects }) } } } as never))); } } satisfies Pick<PluginServerContext,"handle"|"registerSettings"|"before"> as unknown as PluginServerContext);
  stop = () => { void cleanup(); };
}
async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown = {}) {
  const fn = handlers.get(contract.name); assert(fn); return contract.output.parse(await fn(input));
}
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "gongfeng-repos-")); oldHome = process.env.PASEO_HOME; process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "srv_test");
  await mkdir(join(home, "secrets/gongfeng-workbench"), { recursive: true, mode: 0o700 });
  await writeFile(join(home, "secrets/gongfeng-workbench/private-token"), "test-only-token", { mode: 0o600 });
  projects = [];
  for (const id of ["project-a", "project-b"]) {
    const path = join(home, id); await mkdir(path); execFileSync("git", ["init", "-q", path]);
    execFileSync("git", ["-C", path, "remote", "add", "origin", "git@git.woa.com:Group/Sub/Repo.git"]);
    await writeFile(join(path, "user.txt"), "keep my code"); projects.push({ projectId: id, projectDisplayName: "Repo", projectRootPath: path });
  }
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json(remote));
  start();
});
afterEach(async () => { stop?.(); mock.restoreAll(); if (oldHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = oldHome; await rm(home, { recursive: true, force: true }); });

test("相同仓库和项目ID的已添加列表与关联按站点隔离，切回保留旧关系", async () => {
  await rpc(addManagedRepository, { repositoryId: 12 });
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  await rpc(saveConnection, { siteUrl: "https://code.example", token: "other-token" });
  const empty = await rpc(listManagedRepositories); assert(empty.ok); assert.equal(empty.items.length, 0);
  const noBindings = await rpc(listRepositoryBindings); assert(noBindings.ok); assert.equal(noBindings.bindings.length, 0);
  assert.deepEqual(await rpc(bindRepository, { siteUrl: "https://git.woa.com", repositoryId: 12, projectId: "project-a" }), { ok: false, error: "account_changed" });
  await rpc(addManagedRepository, { repositoryId: 12 });
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  let result = await rpc(listRepositoryBindings); assert(result.ok);
  assert.equal(result.bindings[0].instance, "https://code.example");
  assert.equal(result.bindings[0].status, "remote_changed");
  execFileSync("git", ["-C", projects[0].projectRootPath, "remote", "set-url", "origin", "git@code.example:Group/Sub/Repo.git"]);
  result = await rpc(listRepositoryBindings); assert(result.ok); assert.equal(result.bindings[0].status, "valid");
  await rpc(unbindRepository, { projectId: "project-a", repositoryId: 12 });
  await rpc(saveConnection, { siteUrl: "https://git.woa.com" });
  result = await rpc(listRepositoryBindings); assert(result.ok);
  assert.equal(result.bindings.length, 1); assert.equal(result.bindings[0].instance, "git.woa.com");
  const restored = await rpc(listManagedRepositories); assert(restored.ok); assert.equal(restored.items.length, 1);
});

test("克隆远程只使用配置站点的SSH主机，拒绝路径注入和非法站点", () => {
  assert.equal(trustedSshRemote("Group/Sub/Repo", "https://code.example:8443"), "git@code.example:Group/Sub/Repo.git");
  assert.equal(trustedSshRemote("Group/Repo", "https://[::1]"), "ssh://git@[::1]/Group/Repo.git");
  assert.equal(trustedSshRemote("../Other", "https://code.example"), null);
  assert.equal(trustedSshRemote("Group/Repo", "https://user:secret@code.example"), null);
});
test("同仓库可关联两份同名项目，重复添加不重复，重载后保持身份", async () => {
  assert.equal((await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" })).ok, true);
  assert.equal((await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" })).ok, true);
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" }); stop(); start();
  const result = await rpc(listRepositoryBindings, { repositoryId: 12 }); assert(result.ok);
  assert.equal(result.bindings.length, 2); assert.deepEqual(result.projects.map(p => p.matches), [true, true]);
  assert.deepEqual(result.bindings.map(b => [b.daemonId, b.projectId, b.status]).sort((a,b) => a[1].localeCompare(b[1])), [["srv_test", "project-a", "valid"], ["srv_test", "project-b", "valid"]]);
});
test("HTTPS /git/、SSH URL及子组大小写只提供候选，不能静默选择项目", async () => {
  execFileSync("git", ["-C", projects[0].projectRootPath, "remote", "set-url", "origin", "https://git.woa.com/git/Group/Sub/Repo.git"]);
  execFileSync("git", ["-C", projects[1].projectRootPath, "remote", "set-url", "origin", "ssh://git@git.woa.com/Group/Sub/Repo.git"]);
  let result = await rpc(listRepositoryBindings, { repositoryId: 12 }); assert(result.ok); assert.deepEqual(result.projects.map(p => p.matches), [true, true]); assert.equal(result.bindings.length, 0);
  execFileSync("git", ["-C", projects[1].projectRootPath, "remote", "set-url", "origin", "git@git.woa.com:group/Sub/Repo.git"]);
  result = await rpc(listRepositoryBindings, { repositoryId: 12 }); assert(result.ok); assert.deepEqual(result.projects.map(p => p.matches), [true, false]);
});

test("旧HTTP remote的关联重载后仍有效，API请求继续使用HTTPS", async () => {
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.equal(new URL(String(url)).origin, "https://git.woa.com");
    return String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json(remote);
  });
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  execFileSync("git", ["-C", projects[0].projectRootPath, "remote", "set-url", "origin", "http://git.woa.com/git/Group/Sub/Repo.git"]);
  execFileSync("git", ["-C", projects[1].projectRootPath, "remote", "set-url", "origin", "http://git.woa.com/Group/Sub/Repo.git"]);
  stop(); start();
  const result = await rpc(listRepositoryBindings, { repositoryId: 12 }); assert(result.ok);
  assert.equal(result.bindings[0].status, "valid");
  assert.deepEqual(result.projects.map(project => project.matches), [true, true]);
  for (const value of ["http://git.woa.com:8080/Group/Sub/Repo.git", "http://other.example/Group/Sub/Repo.git", "http://git.woa.com/Other/Repo.git"]) {
    execFileSync("git", ["-C", projects[0].projectRootPath, "remote", "set-url", "origin", value]);
    const invalid = await rpc(listRepositoryBindings, { repositoryId: 12 }); assert(invalid.ok);
    assert.equal(invalid.bindings[0].status, "remote_changed", value);
    assert.equal(invalid.projects[0].matches, false, value);
  }
});
test("搜索区分分页、空结果与工蜂权限错误", async () => {
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
    const request = new URL(String(url)); assert.equal(request.pathname, "/api/v3/projects"); assert.equal(request.searchParams.get("type"), "GIT"); assert.equal(request.searchParams.get("search"), "Group Sub");
    if (request.searchParams.get("page") === "1") return Response.json([remote], { headers: { "X-Next-Page": "2" } });
    if (request.searchParams.get("page") === "2") return Response.json([]);
    return new Response("secret forbidden detail", { status: 403 });
  });
  assert.deepEqual(await rpc(searchRepositories, { query: "Group Sub", page: 1 }), { ok: true, items: [{ id: 12, path: "Group/Sub/Repo", name: "Repo" }], nextPage: 2 });
  assert.deepEqual(await rpc(searchRepositories, { query: "Group Sub", page: 2 }), { ok: true, items: [], nextPage: null });
  assert.deepEqual(await rpc(searchRepositories, { query: "Group Sub", page: 3 }), { ok: false, error: "forbidden" });
});
test("更换需确认原关系，过期确认不覆盖，解除仅删除选定关系", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json({ ...remote, id: Number(String(url).split("/").pop()) }));
  const conflict = await rpc(bindRepository, { repositoryId: 13, projectId: "project-a" }); assert(!conflict.ok); assert.equal(conflict.error, "conflict"); assert.equal(conflict.existing?.repository.id, 12);
  assert.equal((await rpc(bindRepository, { repositoryId: 13, projectId: "project-a", replaceRepositoryId: 12 })).ok, true);
  assert.deepEqual(await rpc(bindRepository, { repositoryId: 14, projectId: "project-a", replaceRepositoryId: 12 }), { ok: false, error: "conflict", existing: { daemonId: "srv_test", instance: "git.woa.com", projectId: "project-a", repository: { id: 13, name: "Repo", path: "Group/Sub/Repo" } } });
  assert.deepEqual(await rpc(unbindRepository, { repositoryId: 12, projectId: "project-a" }), { ok: false, error: "stale_binding" });
  assert.deepEqual(await rpc(unbindRepository, { repositoryId: 13, projectId: "project-a" }), { ok: true });
  const result = await rpc(listRepositoryBindings); assert(result.ok); assert.equal(result.bindings.length, 0);
  assert.equal(await readFile(join(projects[0].projectRootPath, "user.txt"), "utf8"), "keep my code"); assert.equal(projects.length, 2);
});
test("保存失败保留旧关联且可恢复，不把失败伪装成功", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  const directory = join(home, "plugin-data", "gongfeng-workbench");
  await rename(directory, `${directory}.backup`); await writeFile(directory, "occupied");
  assert.deepEqual(await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" }), { ok: false, error: "storage_error" });
  await rm(directory); await rename(`${directory}.backup`, directory);
  const result = await rpc(listRepositoryBindings); assert(result.ok); assert.deepEqual(result.bindings.map(b => b.projectId), ["project-a"]);
});
test("项目失效、remote变化、权限变化需核验，不擅自更换项目", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" }); await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" });
  execFileSync("git", ["-C", projects[0].projectRootPath, "remote", "set-url", "origin", "git@git.woa.com:Other/Repo.git"]);
  projects = projects.slice(0, 1);
  let result = await rpc(listRepositoryBindings); assert(result.ok); assert.deepEqual(result.bindings.map(b => b.status), ["remote_changed", "project_missing"]);
  assert.deepEqual(await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" }), { ok: false, error: "project_missing" });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : new Response("", { status: 403 }));
  result = await rpc(listRepositoryBindings); assert(result.ok); assert.equal(result.bindings[0].status, "access_unverified"); assert.equal(result.bindings[0].error, "forbidden");
});
test("不同daemon不读取或解除其他daemon关联", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  await writeFile(join(home, "server-id"), "srv_other");
  const result = await rpc(listRepositoryBindings); assert(result.ok); assert.deepEqual(result.bindings, []);
  await rpc(unbindRepository, { repositoryId: 12, projectId: "project-a" });
  await writeFile(join(home, "server-id"), "srv_test");
  const original = await rpc(listRepositoryBindings); assert(original.ok); assert.equal(original.bindings.length, 1);
});
test("损坏关联存储不能伪装为空或被新关联覆盖", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  const file = join(home, "plugin-data/gongfeng-workbench/repositories.json"); await writeFile(file, "invalid-json");
  assert.deepEqual(await rpc(listRepositoryBindings), { ok: false, error: "storage_error" });
  assert.deepEqual(await rpc(bindRepository, { repositoryId: 12, projectId: "project-b" }), { ok: false, error: "storage_error" });
  assert.equal(await readFile(file, "utf8"), "invalid-json");
});
test("搜索异常响应和无效分页头不是空仓库列表", async () => {
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json([remote], { headers: { "X-Next-Page": "1" } }));
  assert.deepEqual(await rpc(searchRepositories, { query: "", page: 1 }), { ok: false, error: "invalid_response" });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json({ error: "secret detail" }));
  assert.deepEqual(await rpc(searchRepositories, { query: "", page: 1 }), { ok: false, error: "invalid_response" });
});

test("添加仓库无需关联项目，重复添加及重载保持单一记录，主页不查询远程仓库全集", async () => {
  assert.deepEqual(await rpc(listManagedRepositories), { ok: true, items: [] });
  assert.equal((await rpc(addManagedRepository, { repositoryId: 12 })).ok, true);
  await rpc(addManagedRepository, { repositoryId: 12 }); stop(); start();
  mock.method(globalThis, "fetch", async () => { throw new Error("listing must stay local"); });
  assert.deepEqual(await rpc(listManagedRepositories), { ok: true, items: [{ id: 12, path: remote.path_with_namespace, name: "Repo" }] });
});
test("旧关联自动进入已添加列表，解除关联保留仓库，不跨 daemon 泄漏列表", async () => {
  await rpc(bindRepository, { repositoryId: 12, projectId: "project-a" });
  await rm(join(home, "plugin-data/gongfeng-workbench/managed-repositories.json"));
  const before = await rpc(listManagedRepositories); assert(before.ok); assert.equal(before.items.length, 1);
  await rpc(unbindRepository, { repositoryId: 12, projectId: "project-a" });
  const after = await rpc(listManagedRepositories); assert(after.ok); assert.equal(after.items.length, 1);
  await writeFile(join(home, "server-id"), "another-daemon");
  assert.deepEqual(await rpc(listManagedRepositories), { ok: true, items: [] });
});
test("无权限或错误身份的远程仓库不能加入列表", async () => {
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : new Response("private error", { status: 403 }));
  assert.deepEqual(await rpc(addManagedRepository, { repositoryId: 12 }), { ok: false, error: "forbidden" });
  assert.deepEqual(await rpc(listManagedRepositories), { ok: true, items: [] });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json({ ...remote, id: 99 }));
  assert.deepEqual(await rpc(addManagedRepository, { repositoryId: 12 }), { ok: false, error: "invalid_response" });
});
test("已添加列表损坏时明确失败且不覆盖原记录", async () => {
  await rpc(addManagedRepository, { repositoryId: 12 });
  const file = join(home, "plugin-data/gongfeng-workbench/managed-repositories.json");
  await writeFile(file, "invalid-json");
  assert.deepEqual(await rpc(listManagedRepositories), { ok: false, error: "storage_error" });
  assert.deepEqual(await rpc(addManagedRepository, { repositoryId: 12 }), { ok: false, error: "storage_error" });
  assert.equal(await readFile(file, "utf8"), "invalid-json");
});
