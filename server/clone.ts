import { legacySite, siteUrlSchema } from "../shared/site.ts";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cloneOperationSchema, cloneRepository, listCloneOperations } from "../shared/clone.ts";
import type { GongfengClient } from "./gongfeng.ts";
import { trustedSshRemote, type registerRepositories } from "./repositories.ts";
const execute = promisify(execFile);
const recordSchema = cloneOperationSchema.extend({ siteUrl: siteUrlSchema.default(legacySite), remote: z.string(), device: z.number().optional(), inode: z.number().optional() });
type Operation = z.infer<typeof recordSchema>;

export function registerClone(server: Pick<PluginServerContext, "handle">, api: GongfengClient, repositories: ReturnType<typeof registerRepositories>) {
  const home = resolve(process.env.PASEO_HOME || join(homedir(), ".paseo"));
  const directory = join(home, "plugin-data", "gongfeng-workbench"); const file = join(directory, "clones.json");
  const lifetime = new AbortController();
  const visible = (operation: Operation) => cloneOperationSchema.parse(operation);
  async function read() {
    try { return z.array(recordSchema).parse(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async function write(operations: Operation[]) {
    await mkdir(directory, { recursive: true, mode: 0o700 }); const temp = join(directory, `.clones-${randomUUID()}`);
    try { await writeFile(temp, JSON.stringify(operations), { flag: "wx", mode: 0o600 }); await rename(temp, file); }
    finally { await rm(temp, { force: true }).catch(() => {}); }
  }
  async function git(args: string[]) {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes" };
    for (const key of Object.keys(env)) if (key.startsWith("GIT_CONFIG") || ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_TEMPLATE_DIR"].includes(key)) delete (env as NodeJS.ProcessEnv)[key];
    Object.assign(env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" });
    return execute("git", ["-c", "core.hooksPath=/dev/null", ...args], { timeout: 120_000, maxBuffer: 256 * 1024, signal: lifetime.signal, env });
  }
  server.handle(listCloneOperations, async input => {
    try {
      const siteUrl = await api.siteUrl();
      if (input.siteUrl && input.siteUrl !== siteUrl) return { ok: false as const, error: "account_changed" };
      return { ok: true as const, operations: (await read()).filter(item => item.siteUrl === siteUrl).map(visible) }; }
    catch { return { ok: false as const, error: "storage_error" }; }
  });
  server.handle(cloneRepository, (input, context) => {
    return api.exclusive(async () => {
      let operation: Operation | undefined; let operations: Operation[] = [];
      const fail = async (error: string) => {
        if (operation) { operation.error = error; await write(operations).catch(() => {}); }
        return { ok: false as const, error, ...(operation ? { operation: visible(operation) } : {}) };
      };
      try {
        if (!isAbsolute(input.targetPath)) return fail("invalid_path");
        let targetPath: string;
        try { targetPath = join(await realpath(dirname(resolve(input.targetPath))), basename(resolve(input.targetPath))); }
        catch { return fail("invalid_path"); }
        const session = await api.session(input.siteUrl); if (!session.ok) return fail(session.error);
        operations = await read();
        const existing = operations.find(item => item.targetPath === targetPath);
        if (existing && (existing.siteUrl !== session.siteUrl || existing.repositoryId !== input.repositoryId)) return fail("target_conflict");
        operation = existing;
        const response = await session.get(`/projects/${input.repositoryId}`); if (!response.ok) return fail(response.error);
        const parsed = z.object({ id: z.literal(input.repositoryId), path_with_namespace: z.string() }).safeParse(response.data);
        const remote = parsed.success ? trustedSshRemote(parsed.data.path_with_namespace, session.siteUrl) : null;
        if (!remote) return fail("invalid_response");
        if (!operation) {
          try { await lstat(targetPath); return fail("target_exists"); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fail("invalid_path"); }
          operation = { siteUrl: session.siteUrl, id: randomUUID(), repositoryId: input.repositoryId, targetPath, remote, stage: "reserved" }; operations.push(operation); await write(operations);
          await mkdir(targetPath, { mode: 0o700 }); const stat = await lstat(targetPath); operation.device = stat.dev; operation.inode = stat.ino; operation.stage = "cloning"; await write(operations);
          try { await git(["clone", "--template=", "--", remote, targetPath]); }
          catch { return fail("clone_failed"); }
          operation.stage = "cloned"; delete operation.error; await write(operations);
        }
        if (operation.remote !== remote) return fail("repository_changed");
        if (operation.stage === "reserved" || operation.stage === "cloning") return fail("clone_incomplete");
        const stat = await lstat(targetPath);
        if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== operation.device || stat.ino !== operation.inode) return fail("target_changed");
        try { const { stdout } = await git(["-C", targetPath, "config", "--get", "remote.origin.url"]); if (stdout.trim() !== remote) return fail("target_changed"); }
        catch { return fail("target_changed"); }
        let projects;
        try { projects = (await context.paseo.projects.list()).projects; }
        catch { return fail("host_error"); }
        let project = projects.find(item => resolve(item.projectRootPath) === targetPath);
        if (operation.projectId && project?.projectId !== operation.projectId) return fail("project_missing");
        if (!project) {
          try { await execute("paseo", ["project", "create", targetPath, "--home", home, "--json"], { timeout: 30_000, maxBuffer: 128 * 1024, signal: lifetime.signal }); }
          catch { return fail("registration_failed"); }
          try { project = (await context.paseo.projects.list()).projects.find(item => resolve(item.projectRootPath) === targetPath); }
          catch { return fail("host_error"); }
          if (!project) return fail("registration_unverified");
        }
        operation.projectId = project.projectId;
        if (operation.stage !== "completed") {
          operation.stage = "registered"; delete operation.error; await write(operations);
          const binding = await repositories.bind({ siteUrl: session.siteUrl, repositoryId: operation.repositoryId, projectId: project.projectId }, context);
          if (!binding.ok) return fail(`binding_${binding.error}`);
          operation.stage = "completed";
        }
        delete operation.error; await write(operations); return { ok: true as const, operation: visible(operation) };
      } catch { return fail("storage_error"); }
    });
  });
  return () => lifetime.abort();
}
