import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGongfengService } from "./service.ts";

test("会话Hook仅附加当前host/站点的有效关联项目，支持worktree和子目录且拒绝歧义", async () => {
  const { mock } = await import("node:test");
  const { execFileSync } = await import("node:child_process");
  const { mkdir, symlink } = await import("node:fs/promises");
  const { bindRepository, unbindRepository } = await import("../shared/repositories.ts");
  const { registerGongfengTools } = await import("./agent-tools.ts");
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
  const controller = registerGongfengTools({
    registerSettings() { return { read: async () => ({ status: "ready", values: { enabled: true } }), subscribe() { return () => {}; } }; },
    before(name: string, fn: any) { assert.equal(name, "agent.session_open"); hook = fn; return () => {}; },
  } as any, service);
  async function receives(cwd: string) {
    const request = { provider: "codex", cwd, purpose: "interactive", tools: [] };
    return (await hook({ request }, context)).tools.some((t: any) => t.name === "gongfeng_list_repositories");
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
