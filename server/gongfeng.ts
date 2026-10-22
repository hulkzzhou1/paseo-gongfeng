import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { legacySite, siteUrlSchema } from "../shared/site.ts";
import { accountSchema, tokenSchema } from "../shared/connection.ts";
import type { ApiError } from "../shared/api.ts";

export type ApiResult = { ok: true; data: unknown; headers: Headers } | { ok: false; error: ApiError };

const credentialsSchema = z.object({ activeSite: siteUrlSchema, sites: z.array(z.object({ siteUrl: siteUrlSchema, token: tokenSchema })).max(100) });
type Credentials = z.infer<typeof credentialsSchema>;

export function createGongfengClient() {
  const directory = join(resolve(process.env.PASEO_HOME || join(homedir(), ".paseo")), "secrets", "gongfeng-workbench");
  const tokenFile = join(directory, "private-token");
  const lifetime = new AbortController();
  let pending: Promise<unknown> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  }

  async function readCredentials(): Promise<Credentials | null> {
    try {
      const directoryInfo = await lstat(directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || (directoryInfo.mode & 0o077) !== 0) throw new Error("Unsafe credential directory");
      const file = await open(tokenFile, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size > 512 * 1024 || (info.mode & 0o077) !== 0) throw new Error("Unsafe credential file");
        const raw = await file.readFile("utf8");
        if (raw.startsWith("{")) {
          const saved = credentialsSchema.parse(JSON.parse(raw));
          if (!saved.sites.some(site => site.siteUrl === saved.activeSite)) throw new Error("Missing active credential");
          return saved;
        }
        return { activeSite: legacySite, sites: [{ siteUrl: legacySite, token: tokenSchema.parse(raw) }] };
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async function storeCredentials(credentials: Credentials) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Unsafe credential directory");
    await chmod(directory, 0o700);
    const temporary = join(directory, `.private-token-${randomUUID()}`);
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        const content = JSON.stringify(credentialsSchema.parse(credentials));
        if (content.length > 512 * 1024) throw new Error("Credential limit");
        await file.writeFile(content, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      if (lifetime.signal.aborted) throw new Error("Plugin stopped");
      await rename(temporary, tokenFile);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }

  async function request(siteUrl: string, token: string, path: string, query: Record<string, string> = {}): Promise<ApiResult> {
    if (!/^\/(user|projects(?:\/|$)|dashboard\/merge_requests$)/.test(path) || path.includes("..") || path.includes("?") || path.includes("#")) return { ok: false, error: "invalid_response" };
    const url = new URL(`${siteUrl}/api/v3${path}`);
    url.search = new URLSearchParams(query).toString();
    const controller = new AbortController();
    const abort = () => controller.abort();
    lifetime.signal.addEventListener("abort", abort, { once: true });
    if (lifetime.signal.aborted) abort();
    const deadline = Date.now() + 10_000;
    const timer = setTimeout(abort, 10_000);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        let error: ApiError = "network_error";
        let wait = 250 * 2 ** attempt;
        if (controller.signal.aborted) return { ok: false, error: "network_error" };
        try {
          const response = await fetch(url.toString(), {
            method: "GET", headers: { "PRIVATE-TOKEN": token, Accept: "application/json" },
            redirect: "error", signal: controller.signal,
          });
          if (response.ok) {
            const body = await response.text();
            try { return { ok: true, data: JSON.parse(body), headers: response.headers }; }
            catch { return { ok: false, error: "invalid_response" }; }
          }
          await response.body?.cancel().catch(() => {});
          error = ({ 401: "unauthorized", 403: "forbidden", 404: "not_found", 429: "rate_limited" } as const)[response.status as 401] ?? "service_error";
          if (response.status !== 429 && (response.status < 500 || response.status > 599)) return { ok: false, error };
          const retryAfter = response.headers.get("retry-after");
          if (retryAfter) {
            const requested = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
            if (!Number.isNaN(requested)) wait = Math.max(wait, requested);
          }
        } catch { if (controller.signal.aborted) return { ok: false, error: "network_error" }; }
        // Do not shorten Retry-After to fit the request budget and retry too early.
        if (attempt === 2 || wait >= deadline - Date.now()) return { ok: false, error };
        await delay(wait, undefined, { signal: controller.signal });
      }
      return { ok: false, error: "network_error" };
    } catch { return { ok: false, error: "network_error" }; }
    finally { clearTimeout(timer); lifetime.signal.removeEventListener("abort", abort); }
  }

  async function verify(siteUrl: string, token: string) {
    const result = await request(siteUrl, token, "/user");
    if (!result.ok) return result;
    const account = accountSchema.safeParse(result.data);
    return account.success ? { ok: true as const, account: account.data } : { ok: false as const, error: "invalid_response" as const };
  }

  return {
    // Local writes and connection switches share a queue so an operation stays on one site.
    exclusive: serialize,
    async siteUrl() { return (await readCredentials())?.activeSite ?? legacySite; },
    async session(expectedSite?: string) {
      let credentials: Credentials | null;
      try { credentials = await readCredentials(); } catch { return { ok: false as const, error: "storage_error" as const }; }
      if (!credentials) return { ok: false as const, error: "unconfigured" as const };
      const siteUrl = credentials.activeSite;
      if (expectedSite && expectedSite !== siteUrl) return { ok: false as const, error: "account_changed" as const };
      const token = credentials.sites.find(site => site.siteUrl === siteUrl)!.token;
      const result = await verify(siteUrl, token);
      if (!result.ok) return result;
      return { ...result, siteUrl, get: (path: string, query?: Record<string, string>) => request(siteUrl, token, path, query) };
    },
    save: (token?: string, requestedSite?: string) => serialize(async () => {
      let previous: Credentials | null;
      try { previous = await readCredentials(); } catch { return { ok: false as const, error: "storage_error" as const }; }
      const siteUrl = requestedSite ?? legacySite;
      const selectedToken = token ?? previous?.sites.find(site => site.siteUrl === siteUrl)?.token;
      if (!selectedToken) return { ok: false as const, error: "unauthorized" as const };
      const result = await verify(siteUrl, selectedToken);
      if (!result.ok) return result;
      try {
        await storeCredentials({ activeSite: siteUrl, sites: [...(previous?.sites ?? []).filter(site => site.siteUrl !== siteUrl), { siteUrl, token: selectedToken }] });
        return { ...result, siteUrl };
      } catch { return { ok: false as const, error: "storage_error" as const }; }
    }),
    dispose: () => lifetime.abort(),
  };
}

export type GongfengClient = ReturnType<typeof createGongfengClient>;
