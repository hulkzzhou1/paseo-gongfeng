import { legacySite, siteUrlSchema, storedInstance } from "../shared/site.ts";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { GongfengClient } from "./gongfeng.ts";
import { bindingSchema, managedRepositorySchema, addManagedRepository, listManagedRepositories, bindRepository, listRepositoryBindings, searchRepositories, unbindRepository } from "../shared/repositories.ts";
const git = promisify(execFile);
const upstreamRepository = z.object({ id: z.number().int().positive(), path_with_namespace: z.string().min(1), name: z.string() });
type Binding = z.infer<typeof bindingSchema>;

export function trustedSshRemote(path: string, siteUrl = legacySite): string | null {
  if (!path.split("/").every(segment => /^[A-Za-z0-9_.-]+$/.test(segment) && segment !== "." && segment !== "..")) return null;
  const site = siteUrlSchema.safeParse(siteUrl);
  if (!site.success) return null;
  const host = new URL(site.data).hostname;
  return host.includes(":") ? `ssh://git@${host}/${path}.git` : `git@${host}:${path}.git`;
}

function normalizeRemote(value: string, siteUrl: string): string | null {
  try {
    const scp = value.match(/^(?:[^@\s]+@)?([^/:\s]+):([^\s]+)$/);
    const url = new URL(scp && !value.includes("://") ? `ssh://${scp[1]}/${scp[2]}` : value);
    // Existing HTTP remotes identify legacy checkouts; API credentials still use HTTPS.
    const legacyHttp = siteUrl === legacySite && url.protocol === "http:" && !url.port;
    if (!["ssh:", "https:", "http:"].includes(url.protocol) || url.hostname !== new URL(siteUrl).hostname || (url.protocol === "ssh:" ? !!url.port && url.port !== "22" : !legacyHttp && url.origin !== siteUrl)) return null;
    const path = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/\.git$/, "");
    return url.protocol === "ssh:" ? path : path.replace(/^git\//, "");
  } catch { return null; }
}
async function matches(rootPath: string, path: string, siteUrl: string) {
  try {
    const { stdout } = await git("git", ["-C", rootPath, "config", "--get-regexp", "^remote\\..*\\.url$"], { timeout: 5000, maxBuffer: 128 * 1024 });
    return stdout.split("\n").some(line => normalizeRemote(line.slice(line.indexOf(" ") + 1).trim(), siteUrl) === path);
  } catch { return false; }
}

export function registerRepositories(server: PluginServerContext, api: GongfengClient) {
  const home = resolve(process.env.PASEO_HOME || join(homedir(), ".paseo"));
  const directory = join(home, "plugin-data", "gongfeng-workbench");
  const filename = join(directory, "repositories.json");
  const managedFilename = join(directory, "managed-repositories.json");
  let pending: Promise<unknown> = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> { const result = pending.then(operation); pending = result.catch(() => {}); return result; }
  async function daemonId() { return z.string().trim().min(1).max(256).parse(process.env.PASEO_SERVER_ID || await readFile(join(home, "server-id"), "utf8")); }
  async function read(): Promise<Binding[]> {
    try { return z.array(bindingSchema).parse(JSON.parse(await readFile(filename, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async function readManaged(): Promise<z.infer<typeof managedRepositorySchema>[]> {
    try { return z.array(managedRepositorySchema).parse(JSON.parse(await readFile(managedFilename, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async function write(records: Binding[] | z.infer<typeof managedRepositorySchema>[], target = filename) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = join(directory, `.repositories-${randomUUID()}`);
    try { await writeFile(temporary, JSON.stringify(records), { flag: "wx", mode: 0o600 }); await rename(temporary, target); }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
  async function remember(id: string, siteUrl: string, repository: Binding["repository"]) {
    const records = await readManaged();
    await write([...records.filter(r => r.daemonId !== id || r.instance !== storedInstance(siteUrl) || r.repository.id !== repository.id), { daemonId: id, instance: storedInstance(siteUrl), repository }], managedFilename);
  }
  async function projects(paseo: PluginHandlerContext["paseo"]) {
    try { return { ok: true as const, items: (await paseo.projects.list()).projects }; }
    catch { return { ok: false as const, error: "host_error" as const }; }
  }
  async function repository(id: number, session: Extract<Awaited<ReturnType<GongfengClient["session"]>>, {ok:true}>) {
    const result = await session.get(`/projects/${id}`);
    if (!result.ok) return result;
    const parsed = upstreamRepository.safeParse(result.data);
    if (!parsed.success || parsed.data.id !== id) return { ok: false as const, error: "invalid_response" as const };
    return { ok: true as const, item: { id, path: parsed.data.path_with_namespace, name: parsed.data.name } };
  }
  server.handle(searchRepositories, async ({ query, page, siteUrl }) => {
    const session = await api.session(siteUrl); if (!session.ok) return session;
    const response = await session.get("/projects", { search: query, type: "GIT", page: String(page), per_page: "20" });
    if (!response.ok) return response;
    const parsed = z.array(upstreamRepository).safeParse(response.data);
    if (!parsed.success) return { ok: false as const, error: "invalid_response" as const };
    const header = response.headers.get("x-next-page");
    const next = header ? Number(header) : header === "" ? null : parsed.data.length === 20 ? page + 1 : null;
    if (next !== null && (!Number.isSafeInteger(next) || next <= page || next > 10000)) return { ok: false as const, error: "invalid_response" as const };
    return { ok: true as const, items: parsed.data.map(repo => ({ id: repo.id, path: repo.path_with_namespace, name: repo.name })), nextPage: next };
  });
  server.handle(listManagedRepositories, input => serialize(async () => {
    try {
      const id = await daemonId(), siteUrl = await api.siteUrl();
      if (input.siteUrl && input.siteUrl !== siteUrl) return { ok: false as const, error: "account_changed" as const };
      // Existing associations remain visible when upgrading from the binding-only UI.
      const records = [...await readManaged(), ...await read()];
      return { ok: true as const, items: [...new Map(records.filter(r => r.daemonId === id && r.instance === storedInstance(siteUrl)).map(r => [r.repository.id, r.repository])).values()] };
    } catch { return { ok: false as const, error: "storage_error" as const }; }
  }));
  server.handle(addManagedRepository, input => api.exclusive(() => serialize(async () => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    const remote = await repository(input.repositoryId, session); if (!remote.ok) return remote;
    try { await remember(await daemonId(), session.siteUrl, remote.item); return { ok: true as const, repository: remote.item }; }
    catch { return { ok: false as const, error: "storage_error" as const }; }
  })));
  const bind = (input: RpcInput<typeof bindRepository>, { paseo }: PluginHandlerContext): Promise<RpcOutput<typeof bindRepository>> => serialize(async () => {
    const local = await projects(paseo); if (!local.ok) return local;
    if (!local.items.some(p => p.projectId === input.projectId)) return { ok: false as const, error: "project_missing" as const };
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    const remote = await repository(input.repositoryId, session); if (!remote.ok) return remote;
    try {
      const id = await daemonId(); const bindings = await read();
      const existing = bindings.find(b => b.daemonId === id && b.instance === storedInstance(session.siteUrl) && b.projectId === input.projectId);
      if (existing && existing.repository.id !== input.repositoryId && existing.repository.id !== input.replaceRepositoryId) return { ok: false as const, error: "conflict" as const, existing };
      if (input.replaceRepositoryId && (!existing || existing.repository.id !== input.replaceRepositoryId)) return { ok: false as const, error: "stale_binding" as const };
      const binding: Binding = { daemonId: id, instance: storedInstance(session.siteUrl), projectId: input.projectId, repository: remote.item };
      if (existing && existing.repository.id !== remote.item.id) await remember(id, session.siteUrl, existing.repository);
      await remember(id, session.siteUrl, remote.item);
      await write([...bindings.filter(b => b.daemonId !== id || b.instance !== storedInstance(session.siteUrl) || b.projectId !== input.projectId), binding]);
      return { ok: true as const, binding };
    } catch { return { ok: false as const, error: "storage_error" as const }; }
  });
  const list = async (input: RpcInput<typeof listRepositoryBindings>, { paseo }: PluginHandlerContext): Promise<RpcOutput<typeof listRepositoryBindings>> => {
    const local = await projects(paseo); if (!local.ok) return local;
    try {
      const id = await daemonId(), siteUrl = await api.siteUrl();
      if (input.siteUrl && input.siteUrl !== siteUrl) return { ok: false as const, error: "account_changed" as const };
      const records = (await read()).filter(b => b.daemonId === id && b.instance === storedInstance(siteUrl) && (!input.repositoryId || b.repository.id === input.repositoryId));
      const session = await api.session(siteUrl);
      const repos = new Map<number, Awaited<ReturnType<typeof repository>>>();
      for (const repoId of new Set([...records.map(b => b.repository.id), ...(input.repositoryId ? [input.repositoryId] : [])])) {
        repos.set(repoId, session.ok ? await repository(repoId, session) : session);
      }
      const bindings = await Promise.all(records.map(async binding => {
        const project = local.items.find(p => p.projectId === binding.projectId);
        if (!project) return { ...binding, status: "project_missing" as const };
        const remote = repos.get(binding.repository.id);
        if (!remote?.ok) return { ...binding, status: "access_unverified" as const, error: remote && !remote.ok ? remote.error : "invalid_response" as const };
        return { ...binding, repository: remote.item, status: await matches(project.projectRootPath, remote.item.path, siteUrl) ? "valid" as const : "remote_changed" as const };
      }));
      const selected = input.repositoryId ? repos.get(input.repositoryId) : undefined;
      return { ok: true as const, bindings, projects: await Promise.all(local.items.map(async p => ({ id: p.projectId, name: p.projectDisplayName, rootPath: p.projectRootPath, matches: selected?.ok ? await matches(p.projectRootPath, selected.item.path, siteUrl) : false }))) };
    } catch { return { ok: false as const, error: "storage_error" as const }; }
  };
  server.handle(bindRepository, (input, context) => api.exclusive(() => bind(input, context)));
  server.handle(listRepositoryBindings, list);
  server.handle(unbindRepository, input => api.exclusive(() => serialize(async () => {
    try {
      const id = await daemonId(), siteUrl = await api.siteUrl();
      if (input.siteUrl && input.siteUrl !== siteUrl) return { ok: false as const, error: "account_changed" as const };
      const session = { siteUrl };
      const bindings = await read();
      const existing = bindings.find(b => b.daemonId === id && b.instance === storedInstance(session.siteUrl) && b.projectId === input.projectId);
      if (existing && existing.repository.id !== input.repositoryId) return { ok: false as const, error: "stale_binding" as const };
      if (existing) await remember(id, session.siteUrl, existing.repository);
      await write(bindings.filter(b => b.daemonId !== id || b.instance !== storedInstance(session.siteUrl) || b.projectId !== input.projectId)); return { ok: true as const };
    } catch { return { ok: false as const, error: "storage_error" as const }; }
  })));
  return { bind, list };
}
