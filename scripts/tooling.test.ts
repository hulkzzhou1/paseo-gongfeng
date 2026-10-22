import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, copyFile, chmod, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
const script = (name: string) => fileURLToPath(new URL(name, import.meta.url));

test("诊断真实进程只返回允许的字段，不输出参数或环境中的秘密", async () => {
  const secret = "FAKE_TOKEN_MUST_NOT_APPEAR";
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", secret], { env: { ...process.env, TEST_TOKEN: secret }, stdio: "ignore" });
  try {
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    const result = spawnSync(process.execPath, [script("process-status.ts"), String(child.pid)], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(value).sort(), ["name", "pid", "state"]);
    assert.equal(value.pid, child.pid);
    assert.equal(typeof value.name, "string");
    assert.match(value.state, /^[A-Za-z]$/);
    assert(!`${result.stdout}${result.stderr}`.includes(secret));
  } finally { child.kill(); }
});

test("诊断失败不会把无效参数或文件路径带入输出", () => {
  for (const args of [[], ["FAKE_INVALID_TOKEN"], ["0"], ["999999999999"], [String(process.pid), "FAKE_INVALID_TOKEN"]]) {
    const result = spawnSync(process.execPath, [script("process-status.ts"), ...args], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert(!`${result.stdout}${result.stderr}`.includes("FAKE_INVALID_TOKEN"));
    assert(!result.stderr.includes("/proc/"));
  }
});


test("任务状态 CLI 使用标签文档，拒绝无效、缺失和重复状态", async () => {
  const root = await mkdtemp(join(tmpdir(), "gongfeng-status-"));
  try {
    await mkdir(join(root, "docs/agents"), { recursive: true });
    await mkdir(join(root, ".scratch/fixture/issues"), { recursive: true });
    await writeFile(join(root, "docs/agents/triage-labels.md"), "- ready-for-agent：可实施。\n- ready-for-human：待验收。\n");
    await writeFile(join(root, ".scratch/fixture/spec.md"), "Status: ready-for-agent\n");
    const issue = join(root, ".scratch/fixture/issues/01-task.md");
    const run = () => spawnSync(process.execPath, [script("check-status.ts")], { cwd: root, encoding: "utf8" });
    await writeFile(issue, "**Status:** ready-for-human\n");
    assert.equal(run().status, 0);
    for (const body of ["**Status:** implemented\n", "# Missing status\n", "Status: ready-for-agent\n**Status:** ready-for-human\n"]) {
      await writeFile(issue, body);
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /01-task\.md/);
    }
    await writeFile(issue, "Status: local-label\n");
    assert.equal(run().status, 1);
    await writeFile(join(root, "docs/agents/triage-labels.md"), "- ready-for-agent：可实施。\n- local-label：本地标签。\n");
    assert.equal(run().status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("pre-push 检查失败阻止本地推送，成功后推送，并清除 Git 环境", async () => {
  const root = await mkdtemp(join(tmpdir(), "gongfeng-hook-"));
  const repo = join(root, "repo"), remote = join(root, "remote.git"), bin = join(root, "bin");
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_")) delete env[name];
  Object.assign(env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
  const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
  try {
    await mkdir(repo); await mkdir(bin); await mkdir(join(repo, ".githooks"));
    assert.equal(git("init", "--template=").status, 0);
    assert.equal(git("init", "--bare", "--template=", remote).status, 0);
    assert.equal(git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture").status, 0);
    await copyFile(script("../.githooks/pre-push"), join(repo, ".githooks/pre-push"));
    await chmod(join(repo, ".githooks/pre-push"), 0o755);
    assert.equal(git("config", "core.hooksPath", ".githooks").status, 0);
    const npm = join(bin, "npm");
    await writeFile(npm, '#!/bin/sh\nprintf "%s\\n" "$*" "$PWD" "${GIT_DIR-unset}" "${GIT_INDEX_FILE-unset}" > "$HOOK_RECORD"\nexit "$HOOK_EXIT"\n');
    await chmod(npm, 0o755);
    Object.assign(env, { PATH: `${bin}:${process.env.PATH}`, HOOK_RECORD: join(root, "record"), HOOK_EXIT: "1", GIT_DIR: join(repo, ".git"), GIT_INDEX_FILE: join(repo, ".git/index") });
    assert.notEqual(git("push", remote, "HEAD:refs/heads/verified").status, 0);
    assert.equal(git("ls-remote", remote, "refs/heads/verified").stdout.trim(), "");
    assert.equal(await readFile(join(root, "record"), "utf8"), `run check\n${repo}\nunset\nunset\n`);
    env.HOOK_EXIT = "0";
    assert.equal(git("push", remote, "HEAD:refs/heads/verified").status, 0);
    assert.match(git("ls-remote", remote, "refs/heads/verified").stdout, /refs\/heads\/verified/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("hook 安装只作用于当前仓库，重复执行安全并保留已有 hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "gongfeng-install-"));
  const env = { ...process.env };
  for (const name of Object.keys(env)) if (name.startsWith("GIT_")) delete env[name];
  Object.assign(env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
  const git = (...args: string[]) => spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
  const install = () => spawnSync(process.execPath, [script("install-hooks.ts")], { cwd: root, env, encoding: "utf8" });
  try {
    assert.equal(git("init", "--template=").status, 0);
    assert.equal(install().status, 1); // A missing hook cannot be installed.
    await mkdir(join(root, ".githooks"));
    await copyFile(script("../.githooks/pre-push"), join(root, ".githooks/pre-push"));
    await chmod(join(root, ".githooks/pre-push"), 0o755);
    assert.equal(install().status, 0);
    assert.equal(install().status, 0);
    assert.equal(git("config", "--local", "--get", "core.hooksPath").stdout.trim(), ".githooks");
    assert.equal(git("config", "core.hooksPath", "existing-hooks").status, 0);
    assert.equal(install().status, 1);
    assert.equal(git("config", "--get", "core.hooksPath").stdout.trim(), "existing-hooks");
    assert.equal(git("config", "--unset", "core.hooksPath").status, 0);
    await mkdir(join(root, ".git/hooks"), { recursive: true });
    await writeFile(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    assert.equal(install().status, 1);
    assert.equal(git("config", "--get", "core.hooksPath").status, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("状态检查不能在缺少标签或任务文件时静默通过", async () => {
  const root = await mkdtemp(join(tmpdir(), "gongfeng-empty-tracker-"));
  const run = () => spawnSync(process.execPath, [script("check-status.ts")], { cwd: root, encoding: "utf8" });
  try {
    assert.equal(run().status, 1);
    await mkdir(join(root, "docs/agents"), { recursive: true });
    await writeFile(join(root, "docs/agents/triage-labels.md"), "- ready-for-agent：可实施。\n");
    assert.equal(run().status, 1);
    await mkdir(join(root, ".scratch/fixture"), { recursive: true });
    await writeFile(join(root, ".scratch/fixture/spec.md"), "Status: ready-for-agent\n");
    assert.equal(run().status, 0);
    await writeFile(join(root, "docs/agents/triage-labels.md"), "# No labels\n");
    assert.equal(run().status, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
