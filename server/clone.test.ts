import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { cloneRepository, listCloneOperations } from "../shared/clone.ts";
import { listRepositoryBindings } from "../shared/repositories.ts";
import { saveConnection } from "../shared/connection.ts";
let home: string; let env: NodeJS.ProcessEnv; let stop: () => void;
let handlers: Map<string, (input: unknown) => Promise<unknown>>;
const gitBinary = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
function git(args: string[]) { return execFileSync(gitBinary, args, { encoding: "utf8" }).trim(); }

test("克隆使用自定义SSH主机，历史隔离且不能复用另一站点的同仓库ID和目录", async () => {
  const first = await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "site-one") }); assert(first.ok);
  await rpc(saveConnection, { siteUrl: "https://code.example", token: "other-token" });
  let history = await rpc(listCloneOperations, {}); assert(history.ok); assert.equal(history.operations.length, 0);
  const conflict = await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "site-one") });
  assert.deepEqual(conflict, { ok: false, error: "target_conflict" });
  const wrapper = join(home, "bin/git");
  await writeFile(wrapper, (await readFile(wrapper, "utf8")).replaceAll("git@git.woa.com:", "git@code.example:"));
  const second = await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "site-two") }); assert(second.ok);
  assert.equal(git(["-C", second.operation.targetPath, "config", "--get", "remote.origin.url"]), "git@code.example:Group/Sub/Repo.git");
  history = await rpc(listCloneOperations, {}); assert(history.ok); assert.equal(history.operations.length, 1); assert.equal(history.operations[0].id, second.operation.id);
  await rpc(saveConnection, { siteUrl: "https://git.woa.com" });
  history = await rpc(listCloneOperations, {}); assert(history.ok); assert.equal(history.operations.length, 1); assert.equal(history.operations[0].id, first.operation.id);
});
function start() {
  handlers = new Map();
  const cleanup = contribute({ before() { return () => {}; }, registerSettings(definition) { return { read: async () => ({ status: "ready" as const, revision: "test", values: definition.schema.parse({}) }), subscribe: () => () => {} }; }, handle(contract, handler) { handlers.set(contract.name, input => Promise.resolve(handler(contract.input.parse(input), { paseo: { projects: { list: async () => ({ projects: JSON.parse(await readFile(join(home, "projects.json"), "utf8")) }) } } } as never))); } } satisfies Pick<PluginServerContext,"handle"|"registerSettings"|"before"> as unknown as PluginServerContext);
  stop = () => { void cleanup(); };
}
async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown = {}) { const fn = handlers.get(contract.name); assert(fn, `missing ${contract.name}`); return contract.output.parse(await fn(input)); }
beforeEach(async () => {
  env = { ...process.env }; home = await mkdtemp(join(tmpdir(), "gongfeng-clone-")); process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "srv_clone_test"); await writeFile(join(home, "projects.json"), "[]");
  await mkdir(join(home, "secrets/gongfeng-workbench"), { recursive: true, mode: 0o700 });
  await writeFile(join(home, "secrets/gongfeng-workbench/private-token"), "test-only-token", { mode: 0o600 });
  const source = join(home, "source"); await mkdir(source); git(["init", "-q", source]); await writeFile(join(source, "README.md"), "clone fixture"); git(["-C", source, "add", "."]); git(["-C", source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
  const config = join(home, "gitconfig"); await writeFile(config, `[url "${source}"]\n insteadOf = git@git.woa.com:Group/Sub/Repo.git\n[protocol "file"]\n allow = always\n`); process.env.GIT_CONFIG_GLOBAL = config;
  const bin = join(home, "bin"); await mkdir(bin); process.env.PATH = `${bin}:${env.PATH}`;
  await writeFile(join(bin, "git"), `#!/usr/bin/env node\nconst cp=require('node:child_process');const args=['-c',${JSON.stringify(`url.${source}.insteadOf=git@git.woa.com:Group/Sub/Repo.git`)},'-c','protocol.file.allow=always',...process.argv.slice(2)];const result=cp.spawnSync(${JSON.stringify(gitBinary)},args,{stdio:'inherit'});process.exit(result.status??1);\n`, { mode: 0o700 });
  await writeFile(join(bin, "paseo"), `#!/usr/bin/env node\nconst fs = require('node:fs'); const p = require('node:path'); const args = process.argv.slice(2); const home = process.env.PASEO_HOME; if(args[0] !== 'project' || args[1] !== 'create' || args[3] !== '--home' || args[4] !== home || args[5] !== '--json') process.exit(2); if(fs.existsSync(p.join(home,'fail-register'))) process.exit(3); const file=p.join(home,'projects.json'); const list=JSON.parse(fs.readFileSync(file)); let project=list.find(x=>x.projectRootPath===args[2]); if(!project){project={projectId:'prj_cloned',projectDisplayName:'Cloned',projectRootPath:args[2]};list.push(project);fs.writeFileSync(file,JSON.stringify(list));} console.log(JSON.stringify({projectId:project.projectId,path:project.projectRootPath}));\n`, { mode: 0o700 });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json({ id: 12, path_with_namespace: "Group/Sub/Repo", name: "Repo" })); start();
});
afterEach(async () => { stop?.(); mock.restoreAll(); for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env); await rm(home, { recursive: true, force: true }); });
test("克隆完整仓库并向当前daemon登记关联，重复请求和重载不重复项目", async () => {
  for (const name of ["review.prepare", "review.start", "review.history"]) assert(!handlers.has(name), `${name} must remain unregistered`);
  const targetPath = join(home, "cloned");
  const result = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(result.ok); assert.equal(result.operation.stage, "completed"); assert.equal(result.operation.projectId, "prj_cloned");
  assert.equal(await readFile(join(targetPath, "README.md"), "utf8"), "clone fixture");
  stop(); start(); const again = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert.deepEqual(again, result);
  assert.equal(JSON.parse(await readFile(join(home, "projects.json"), "utf8")).length, 1);
  const bindings = await rpc(listRepositoryBindings); assert(bindings.ok); assert.equal(bindings.bindings.length, 1);
  const history = await rpc(listCloneOperations); assert(history.ok); assert.equal(history.operations.length, 1);
});
test("已有目录及无效目标不覆盖，缺失父目录返回可操作路径错误", async () => {
  const targetPath = join(home, "existing"); await mkdir(targetPath); await writeFile(join(targetPath, "keep.txt"), "keep");
  assert.deepEqual(await rpc(cloneRepository, { repositoryId: 12, targetPath }), { ok: false, error: "target_exists" });
  assert.equal(await readFile(join(targetPath, "keep.txt"), "utf8"), "keep");
  assert.deepEqual(await rpc(cloneRepository, { repositoryId: 12, targetPath: "relative-path" }), { ok: false, error: "invalid_path" });
  assert.deepEqual(await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "missing-parent", "clone") }), { ok: false, error: "invalid_path" });
});
test("登记失败后保留clone，重载恢复且不覆盖后续本地修改", async () => {
  await writeFile(join(home, "fail-register"), "yes"); const targetPath = join(home, "retry");
  const failed = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(!failed.ok); assert.equal(failed.error, "registration_failed"); assert.equal(failed.operation?.stage, "cloned");
  await writeFile(join(targetPath, "README.md"), "user edit after failure"); await rm(join(home, "fail-register")); stop(); start();
  const recovered = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(recovered.ok); assert.equal(recovered.operation.stage, "completed");
  assert.equal(await readFile(join(targetPath, "README.md"), "utf8"), "user edit after failure");
});
test("关联保存失败显示已登记项目，恢复复用同一项目且不重复clone", async () => {
  let detailRequests = 0;
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).endsWith("/user")) return Response.json({ id: 7, username: "test", name: "Test" });
    if (++detailRequests === 2) return new Response("private failure", { status: 403 });
    return Response.json({ id: 12, path_with_namespace: "Group/Sub/Repo", name: "Repo" });
  });
  const targetPath = join(home, "binding-retry"); const failed = await rpc(cloneRepository, { repositoryId: 12, targetPath });
  assert(!failed.ok); assert.equal(failed.error, "binding_forbidden"); assert.equal(failed.operation?.projectId, "prj_cloned"); assert.equal(failed.operation.stage, "registered");
  stop(); start(); assert.equal((await rpc(cloneRepository, { repositoryId: 12, targetPath })).ok, true);
  assert.equal(JSON.parse(await readFile(join(home, "projects.json"), "utf8")).length, 1);
});
test("并发重复提交只克隆登记一次；失败响应不含令牌或命令输出", async () => {
  const targetPath = join(home, "concurrent"); const [a, b] = await Promise.all([rpc(cloneRepository, { repositoryId: 12, targetPath }), rpc(cloneRepository, { repositoryId: 12, targetPath })]);
  assert.deepEqual(a, b); assert(a.ok); assert.equal(JSON.parse(await readFile(join(home, "projects.json"), "utf8")).length, 1);
  mock.method(globalThis, "fetch", async () => new Response("test-only-token private detail", { status: 403 }));
  const denied = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(!denied.ok); assert(!JSON.stringify(denied).includes("test-only-token"));
});
test("不执行全局Git hooks或仓库setup；远程路径不能注入命令或外部主机", async () => {
  const hooks = join(home, "hooks"); await mkdir(hooks); await writeFile(join(hooks, "post-checkout"), `#!/bin/sh\ntouch '${join(home, "hook-executed")}'\n`, { mode: 0o700 });
  git(["config", "--global", "core.hooksPath", hooks]);
  await writeFile(join(home, "source", ".paseo.json"), JSON.stringify({ worktree: { setup: [`touch '${join(home, "setup-executed")}'`] } })); git(["-C", join(home, "source"), "add", "."]); git(["-C", join(home, "source"), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "setup fixture"]);
  assert.equal((await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "no-hooks") })).ok, true);
  await assert.rejects(readFile(join(home, "hook-executed")), { code: "ENOENT" }); await assert.rejects(readFile(join(home, "setup-executed")), { code: "ENOENT" });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).endsWith("/user") ? Response.json({ id: 7, username: "test", name: "Test" }) : Response.json({ id: 12, path_with_namespace: "../evil;touch /tmp/no", name: "Repo" }));
  assert.deepEqual(await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "bad") }), { ok: false, error: "invalid_response" });
});
test("克隆中断保留已创建目录并阻止盲目重试，不重复登记", async () => {
  const targetPath = join(home, "interrupted");
  await writeFile(join(home, "bin", "git"), `#!/usr/bin/env node\nconst fs=require('node:fs');const cp=require('node:child_process');const args=process.argv.slice(2);if(args.includes('clone')){fs.writeFileSync(${JSON.stringify(join(targetPath, "partial.txt"))},'partial clone');setInterval(()=>{},1000);}else{const r=cp.spawnSync(${JSON.stringify(gitBinary)},args,{stdio:'inherit'});process.exit(r.status??1);}\n`, { mode: 0o700 });
  const pending = rpc(cloneRepository, { repositoryId: 12, targetPath });
  for (let attempt = 0; attempt < 200; attempt++) { try { await readFile(join(targetPath, "partial.txt")); break; } catch { await new Promise(resolve => setTimeout(resolve, 5)); } }
  assert.equal(await readFile(join(targetPath, "partial.txt"), "utf8"), "partial clone"); stop();
  const failed = await pending; assert(!failed.ok); assert.equal(failed.error, "clone_failed");
  start(); const retry = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(!retry.ok); assert.equal(retry.error, "clone_incomplete");
  assert.equal(await readFile(join(targetPath, "partial.txt"), "utf8"), "partial clone"); assert.deepEqual(JSON.parse(await readFile(join(home, "projects.json"), "utf8")), []);
});
test("父进程的Git目录变量不会把克隆核验指向用户开发目录", async () => {
  process.env.GIT_DIR = join(home, "source", ".git"); process.env.GIT_WORK_TREE = join(home, "source"); process.env.GIT_INDEX_FILE = join(home, "source", ".git", "index");
  const result = await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "env-safe") }); assert(result.ok); assert.equal(await readFile(join(home, "source", "README.md"), "utf8"), "clone fixture");
});
test("关系文件不可写时保留已登记项目，修复存储后可以完成关联", async () => {
  const directory = join(home, "plugin-data", "gongfeng-workbench"); await mkdir(directory, { recursive: true }); await mkdir(join(directory, "repositories.json"));
  const targetPath = join(home, "storage-retry"); const result = await rpc(cloneRepository, { repositoryId: 12, targetPath }); assert(!result.ok); assert.equal(result.error, "binding_storage_error"); assert.equal(result.operation?.projectId, "prj_cloned");
  await rm(join(directory, "repositories.json"), { recursive: true }); assert.equal((await rpc(cloneRepository, { repositoryId: 12, targetPath })).ok, true);
  assert.equal(JSON.parse(await readFile(join(home, "projects.json"), "utf8")).length, 1);
});

test("隔离全局内容过滤器与Git配置注入，clone不会执行smudge脚本", async () => {
  const marker = join(home, "filter-executed"); const filter = join(home, "smudge.sh");
  await writeFile(filter, `#!/bin/sh\ntouch '${marker}'\ncat\n`, { mode: 0o700 });
  git(["config", "--global", "filter.injected.smudge", filter]);
  await writeFile(join(home, "source", ".gitattributes"), "README.md filter=injected\n"); git(["-C", join(home, "source"), "add", "."]); git(["-C", join(home, "source"), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "attribute fixture"]);
  process.env.GIT_CONFIG_COUNT = "1"; process.env.GIT_CONFIG_KEY_0 = "filter.injected.smudge"; process.env.GIT_CONFIG_VALUE_0 = filter;
  const result = await rpc(cloneRepository, { repositoryId: 12, targetPath: join(home, "filter-safe") }); assert(result.ok);
  await assert.rejects(readFile(marker), { code: "ENOENT" });
});
