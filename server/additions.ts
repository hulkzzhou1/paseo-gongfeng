import { legacySite } from "../shared/site.ts";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { shaSchema } from "../shared/detail.ts";
import { mrTapd, mrCi } from "../shared/additions.ts";
import { readDetail } from "./detail.ts";
import type { GongfengClient } from "./gongfeng.ts";
const invalid = { ok: false as const, error: "invalid_response" as const };
const rawWorkitem = z.object({
  workspace_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), source_project_id: z.number().int().positive(), source_id: z.number().int().positive(), source_type: z.literal("mr"),
  tapd_id_str: z.string().regex(/^[1-9][0-9]{0,30}$/), tapd_type: z.string(), name: z.string(), status_zh: z.string().optional(), status: z.string().default("未知"),
});
const rawCi = z.object({ sha: shaSchema, state: z.string(), total_count: z.number().int().nonnegative(), statuses: z.array(z.object({ id: z.number().int().positive(), state: z.string(), context: z.string(), description: z.string().nullable().optional(), target_url: z.string().nullable().optional() })).max(20) });
function externalUrl(value: string | null | undefined): string | null {
  try { const url = new URL(value || ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export function registerAdditions(server: PluginServerContext, api: GongfengClient) {
  server.handle(mrCi, async ref => {
    const session = await api.session(ref.siteUrl); if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    const detail = await readDetail(session, ref); if (!detail.ok) return detail;
    if (!detail.detail.sourceSha) return { ok: false as const, error: "version_unknown" as const };
    if (detail.detail.sourceSha !== ref.sourceSha || detail.detail.sourceProjectId !== ref.sourceProjectId || detail.detail.targetBranch !== ref.targetBranch) return { ok: false as const, error: "version_changed" as const };
    const result = await session.get(`/projects/${ref.sourceProjectId}/commits/${ref.sourceSha}/status`, { page: String(ref.page), per_page: "20", target_branch: ref.targetBranch });
    if (!result.ok) return result;
    const parsed = rawCi.safeParse(result.data);
    if (!parsed.success) return invalid;
    const data = parsed.data;
    if (data.statuses.length > Math.max(0, data.total_count - (ref.page - 1) * 20)) return invalid;
    if (data.sha !== ref.sourceSha) return { ok: false as const, error: "version_changed" as const };
    const hasMore = data.total_count > ref.page * 20;
    const gap = data.statuses.length < Math.min(20, Math.max(0, data.total_count - (ref.page - 1) * 20));
    return { ok: true as const, sha: data.sha, state: data.statuses.length ? data.state : "unknown", total: data.total_count,
      items: data.statuses.map(item => ({ id: item.id, state: item.state, context: item.context.slice(0,2000), description: (item.description || "").slice(0,5000), url: externalUrl(item.target_url) })),
      nextPage: hasMore && data.statuses.length && ref.page < 10000 ? ref.page + 1 : null, incomplete: hasMore || gap,
    };
  });
  server.handle(mrTapd, async ref => {
    const session = await api.session(ref.siteUrl); if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    const detail = await readDetail(session, ref); if (!detail.ok) return detail;
    const result = await session.get(`/projects/${ref.projectId}/tapd_workitems`, { type: "mr", iid: String(detail.detail.iid) });
    if (!result.ok) return result;
    const parsed = z.array(rawWorkitem).safeParse(result.data);
    if (!parsed.success || parsed.data.some(w => w.source_project_id !== ref.projectId || w.source_id !== detail.detail.iid)) return invalid;
    return { ok: true as const, incomplete: parsed.data.length > 1000, items: parsed.data.slice(0,1000).map(work => ({
      id: work.tapd_id_str, workspaceId: String(work.workspace_id), kind: work.tapd_type, title: work.name.slice(0,2000), status: work.status_zh || work.status,
      url: session.siteUrl === legacySite && ["story","bug","task"].includes(work.tapd_type) ? `https://tapd.woa.com/tapd_fe/${work.workspace_id}/${work.tapd_type}/detail/${work.tapd_id_str}` : null,
    })) };
  });
}
