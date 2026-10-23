import { createHash } from "node:crypto";
import { z } from "zod";
import type { RpcOutput } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { milestoneDetail, milestonesPage, saveMilestone, deleteMilestone, milestoneItems, searchMilestoneItems, saveMilestoneLinks, type MilestoneItem, type Milestone } from "../shared/milestones.ts";
import type { GongfengClient } from "./gongfeng.ts";
import type { registerRepositories } from "./repositories.ts";

export const rawMilestone = z.object({ id: z.number().int().positive(), iid: z.number().int().positive(), project_id: z.number().int().positive(), title: z.string(), state: z.string().min(1), description: z.string().nullish(), due_date: z.string().nullish(), updated_at: z.string().nullish() });
export function normalizeMilestone(data: z.infer<typeof rawMilestone>, repositoryPath: string): Milestone {
  const description = data.description ?? "";
  return { id: data.id, iid: data.iid, projectId: data.project_id, repositoryPath, title: data.title, state: data.state, description: description.slice(0, 100000), descriptionTruncated: description.length > 100000, dueDate: data.due_date || null, updatedAt: data.updated_at ?? null,
    revision: createHash("sha256").update(JSON.stringify([data.id, data.project_id, data.title, description, data.state, data.due_date ?? null, data.updated_at ?? null])).digest("hex") };
}
const invalid = { ok: false as const, error: "invalid_response" as const };
export function registerMilestones(server: PluginServerContext, api: GongfengClient, repositories: ReturnType<typeof registerRepositories>) {
  async function access(input: { siteUrl?: string; accountId: number; projectId?: number }) {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false as const, error: "account_changed" as const };
    const managed = await repositories.managed({ siteUrl: session.siteUrl }); if (!managed.ok) return managed;
    if (input.projectId !== undefined && !managed.items.some(r => r.id === input.projectId)) return { ok: false as const, error: "stale_binding" as const };
    return { ok: true as const, session, repositories: managed.items };
  }
  server.handle(milestonesPage, async input => {
    const scope = await access(input); if (!scope.ok) return scope;
    const selected = scope.repositories.filter(r => input.repositoryId === undefined || r.id === input.repositoryId);
    if (input.repositoryId && !selected.length) return { ok: false as const, error: "stale_binding" as const };
    const cursors = input.cursors ?? selected.map(r => ({ projectId: r.id, page: 1 }));
    if (new Set(cursors.map(c => c.projectId)).size !== cursors.length || cursors.some(c => !selected.some(r => r.id === c.projectId))) return invalid;
    const results = await Promise.all(cursors.slice(0, 4).map(async cursor => {
      const result = await scope.session.get(`/projects/${cursor.projectId}/milestones`, { ...(input.state === "all" ? {} : { state: input.state }), order_by: "due_date", sort: "asc", page: String(cursor.page), per_page: "20" });
      if (!result.ok) return { ...cursor, ok: false as const, error: result.error };
      const data = z.array(rawMilestone).safeParse(result.data);
      if (!data.success || data.data.some(m => m.project_id !== cursor.projectId)) return { ...cursor, ...invalid };
      const header = result.headers.get("x-next-page"), next = header === "" ? null : header === null ? data.data.length >= 20 ? cursor.page + 1 : null : Number(header);
      if (next !== null && (!Number.isSafeInteger(next) || next <= cursor.page || next > 10000)) return { ...cursor, ...invalid };
      return { ...cursor, ok: true as const, next, items: data.data.filter(m => input.state === "all" || m.state === input.state).map(m => normalizeMilestone(m, selected.find(r => r.id === cursor.projectId)!.path)) };
    }));
    return { ok: true as const, repositoryCount: selected.length, items: results.flatMap(r => r.ok ? r.items : []), next: [...cursors.slice(4), ...results.flatMap(r => r.ok && r.next ? [{ projectId: r.projectId, page: r.next }] : [])], failures: results.flatMap(r => r.ok ? [] : [{ projectId: r.projectId, error: r.error }]) };
  });
  async function read(input: { siteUrl?: string; accountId: number; projectId: number; milestoneId: number }) {
    const scope = await access(input); if (!scope.ok) return scope;
    const result = await scope.session.get(`/projects/${input.projectId}/milestones/${input.milestoneId}`); if (!result.ok) return result;
    const data = rawMilestone.safeParse(result.data);
    if (!data.success || data.data.project_id !== input.projectId || data.data.id !== input.milestoneId) return invalid;
    return { ok: true as const, milestone: normalizeMilestone(data.data, scope.repositories.find(r => r.id === input.projectId)!.path) };
  }
  server.handle(milestoneDetail, read);
  server.handle(saveMilestone, input => api.exclusive(async () => {
    const scope = await access(input); if (!scope.ok) return scope;
    if (input.milestoneId) {
      const before = await read({ ...input, milestoneId: input.milestoneId }); if (!before.ok) return before;
      if (before.milestone.revision !== input.revision) return { ok: false as const, error: "stale_milestone" as const };
    }
    const body = { title: input.title, ...(input.description !== undefined ? { description: input.description } : {}), ...(input.dueDate !== undefined ? { due_date: input.dueDate ?? "" } : {}), ...(input.stateEvent ? { state_event: input.stateEvent } : {}) };
    const endpoint = `/projects/${input.projectId}/milestones`;
    const result = input.milestoneId ? await scope.session.put(`${endpoint}/${input.milestoneId}`, body) : await scope.session.post(endpoint, body);
    if (!result.ok) return { ok: false as const, error: ["network_error", "service_error", "invalid_response"].includes(result.error) ? "outcome_unknown" as const : result.error };
    const created = rawMilestone.safeParse(result.data);
    const id = input.milestoneId ?? (created.success ? created.data.id : undefined);
    if (!id) return { ok: false as const, error: "outcome_unknown" as const };
    const current = await read({ ...input, milestoneId: id });
    if (!current.ok || current.milestone.title !== input.title || input.description !== undefined && current.milestone.description !== input.description || input.dueDate !== undefined && (current.milestone.dueDate?.slice(0, 10) ?? null) !== input.dueDate || input.stateEvent && current.milestone.state !== (input.stateEvent === "close" ? "closed" : "active")) return { ok: false as const, error: "outcome_unknown" as const };
    return current;
  }));
  server.handle(deleteMilestone, input => api.exclusive(async () => {
    const scope = await access(input); if (!scope.ok) return scope;
    const before = await read(input); if (!before.ok) return before;
    if (before.milestone.revision !== input.revision || before.milestone.title !== input.title) return { ok: false as const, error: "stale_milestone" as const };
    const result = await scope.session.delete(`/projects/${input.projectId}/milestones/${input.milestoneId}`);
    if (!result.ok) return { ok: false as const, error: ["network_error", "service_error", "invalid_response"].includes(result.error) ? "outcome_unknown" as const : result.error };
    const after = await read(input);
    return !after.ok && after.error === "not_found" ? { ok: true as const } : { ok: false as const, error: "outcome_unknown" as const };
  }));
  const rawItem = z.object({ id: z.number().int().positive(), iid: z.number().int().positive(), title: z.string(), state: z.string(), project_id: z.number().int().positive().optional(), target_project_id: z.number().int().positive().optional(), milestone: z.object({ id: z.number().int().positive(), title: z.string() }).nullish() });
  type Session = Extract<Awaited<ReturnType<GongfengClient["session"]>>, { ok: true }>;
  function item(data: z.infer<typeof rawItem>, kind: "issue" | "mr", projectId: number, path: string, siteUrl: string): MilestoneItem | null {
    if ((kind === "issue" ? data.project_id : data.target_project_id ?? data.project_id) !== projectId) return null;
    return { kind, id: data.id, iid: data.iid, projectId, title: data.title, state: data.state, milestone: data.milestone ?? null, url: `${siteUrl}/${path.split("/").map(encodeURIComponent).join("/")}/${kind === "issue" ? "issues" : "merge_requests"}/${data.iid}` };
  }
  async function readItem(session: Session, projectId: number, path: string, kind: "issue" | "mr", id: number) {
    const result = await session.get(`/projects/${projectId}/${kind === "issue" ? "issues" : "merge_request"}/${id}`); if (!result.ok) return result;
    const parsed = rawItem.safeParse(result.data); if (!parsed.success || parsed.data.id !== id) return invalid;
    const normalized = item(parsed.data, kind, projectId, path, session.siteUrl);
    return normalized ? { ok: true as const, item: normalized } : invalid;
  }
  async function itemPage(input: { siteUrl?: string; accountId: number; projectId: number; milestoneId: number; kind: "issue" | "mr"; page: number; query?: string }) {
    const scope = await access(input); if (!scope.ok) return scope;
    const detail = await read(input); if (!detail.ok) return detail;
    const candidate = input.query !== undefined;
    const query: Record<string, string> = { page: String(input.page), per_page: "20" };
    if (candidate) {
      if (/^[!#]?\d+$/.test(input.query!)) query[input.kind === "issue" ? "iid" : "iids[]"] = input.query!.replace(/^[!#]/, "");
      else query.search = input.query!;
    } else if (input.kind === "mr") query.milestone = detail.milestone.title;
    const endpoint = input.kind === "issue" ? candidate ? `/projects/${input.projectId}/issues` : `/projects/${input.projectId}/milestones/${input.milestoneId}/issues` : `/projects/${input.projectId}/merge_requests`;
    const result = await scope.session.get(endpoint, query); if (!result.ok) return result;
    const rows = z.array(rawItem).safeParse(result.data); if (!rows.success) return invalid;
    const normalized = rows.data.map(r => item(r, input.kind, input.projectId, detail.milestone.repositoryPath, scope.session.siteUrl));
    if (normalized.some(i => !i)) return invalid;
    const header = result.headers.get("x-next-page"), next = header === "" ? null : header === null ? rows.data.length >= 20 ? input.page + 1 : null : Number(header);
    if (next !== null && (!Number.isSafeInteger(next) || next <= input.page || next > 10000)) return invalid;
    return { ok: true as const, items: normalized.filter((i): i is MilestoneItem => !!i && (candidate || i.milestone?.id === input.milestoneId)), nextPage: next };
  }
  server.handle(milestoneItems, itemPage);
  server.handle(searchMilestoneItems, itemPage);
  server.handle(saveMilestoneLinks, input => api.exclusive(async (): Promise<RpcOutput<typeof saveMilestoneLinks>> => {
    const scope = await access(input); if (!scope.ok) return scope;
    const detail = await read(input); if (!detail.ok) return detail;
    const path = detail.milestone.repositoryPath;
    // Validate the whole draft before the first write; the platform has no batch transaction.
    for (let offset = 0; offset < input.changes.length; offset += 4) {
      const checks = await Promise.all(input.changes.slice(offset, offset + 4).map(async change => ({ change, current: await readItem(scope.session, input.projectId, path, change.kind, change.id) })));
      for (const { change, current } of checks) {
        if (!current.ok) return current;
        if ((current.item.milestone?.id ?? null) !== change.originalMilestoneId || change.action === "remove" && change.originalMilestoneId !== input.milestoneId || change.action === "add" && change.originalMilestoneId !== null && change.originalMilestoneId !== input.milestoneId && !input.confirmMigration) return { ok: false, error: "conflict" };
      }
    }
    const results: Extract<RpcOutput<typeof saveMilestoneLinks>, { ok: true }>["results"] = [];
    let attempted = false;
    for (const change of input.changes) {
      const before = await readItem(scope.session, input.projectId, path, change.kind, change.id);
      if (!before.ok || (before.item.milestone?.id ?? null) !== change.originalMilestoneId) { results.push({ kind: change.kind, id: change.id, ok: false, error: before.ok ? "conflict" : before.error }); break; }
      const desired = change.action === "add" ? input.milestoneId : null;
      if ((before.item.milestone?.id ?? null) === desired) { results.push({ kind: change.kind, id: change.id, ok: true, item: before.item }); continue; }
      attempted = true;
      const result = await scope.session.put(`/projects/${input.projectId}/${change.kind === "issue" ? "issues" : "merge_request"}/${change.id}`, { milestone_id: desired });
      const after = await readItem(scope.session, input.projectId, path, change.kind, change.id);
      const confirmed = result.ok && after.ok && (after.item.milestone?.id ?? null) === desired;
      results.push({ kind: change.kind, id: change.id, ok: confirmed, ...(after.ok ? { item: after.item } : {}), ...(!confirmed ? { error: !result.ok && !["network_error", "service_error", "invalid_response"].includes(result.error) ? result.error : "outcome_unknown" as const } : {}) });
      if (!confirmed) break;
    }
    return { ok: true, complete: results.length === input.changes.length && results.every(r => r.ok), attempted, results };
  }));

}
