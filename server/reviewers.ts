import { avatarUrl } from "./avatar.ts";
import { z } from "zod";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { GongfengClient } from "./gongfeng.ts";
import type { RpcOutput } from "@getpaseo/plugin";
import { reviewUser, saveReviewers, searchReviewers, submitReview } from "../shared/reviewers.ts";
import { readDetail, readReview } from "./detail.ts";

export function registerReviewers(server: PluginServerContext, api: GongfengClient) {
  server.handle(searchReviewers, async input => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false as const, error: "account_changed" as const };
    const result = await session.get(`/projects/${input.projectId}/members/all`, { query: input.query, page: String(input.page), per_page: "20" });
    if (!result.ok) return result;
    const members = z.array(reviewUser.extend({ state: z.string(), avatar_url: z.unknown().optional() })).safeParse(result.data);
    if (!members.success) return { ok: false as const, error: "invalid_response" as const };
    const header = result.headers.get("x-next-page");
    const next = header ? Number(header) : header === "" ? null : members.data.length === 20 ? input.page + 1 : null;
    if (next !== null && (!Number.isSafeInteger(next) || next <= input.page || next > 10000)) return { ok: false as const, error: "invalid_response" as const };
    return { ok: true as const, items: members.data.filter(p => p.state === "active").map(p => reviewUser.parse({ ...p, avatarUrl: avatarUrl(p.avatar_url, session.siteUrl) })), nextPage: next };
  });
  server.handle(saveReviewers, input => api.exclusive(async (): Promise<RpcOutput<typeof saveReviewers>> => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false, error: "account_changed" };
    const before = await readReview(session, input); if (!before.ok) return before;
    if (before.revision !== input.revision) return { ok: false, error: "stale_review", current: before };
    if (before.reviewers.length > 100) return { ok: false, error: "reviewer_limit", current: before };
    const existing = new Map(before.reviewers.map(p => [p.id, p]));
    const desired = new Map(input.reviewers.map(p => [p.id, p]));
    const changes = input.reviewers.filter(p => existing.has(p.id) && (existing.get(p.id)!.type === "necessary") !== p.necessary);
    const adding = input.reviewers.filter(p => !existing.has(p.id) || changes.some(c => c.id === p.id));
    const removing = before.reviewers.filter(p => !desired.has(p.id));
    if (!adding.length && !removing.length) return { ok: true, current: before };
    const endpoint = `/projects/${input.projectId}/merge_request/${input.mrId}/review`;
    let attempted = false;
    const failed = async (error: Extract<RpcOutput<typeof saveReviewers>, { ok: false }>["error"]) => ({ ok: false as const, error, attempted, current: await readReview(session, input) });
    for (const person of changes) {
      attempted = true;
      const result = await session.delete(`${endpoint}/dismissals`, { reviewer_id: String(person.id) });
      if (!result.ok) return failed(result.error);
    }
    if (adding.length) {
      attempted = true;
      const result = await session.post(`${endpoint}/batch_invite`, { reviewer_ids: adding.filter(p => !p.necessary).map(p => p.id), necessary_reviewer_ids: adding.filter(p => p.necessary).map(p => p.id) });
      if (!result.ok) return failed(result.error);
      const failures = z.object({ fail_list: z.array(z.unknown()).optional() }).safeParse(result.data ?? {});
      if (!failures.success || failures.data.fail_list?.length) return failed("partial_update");
    }
    for (const person of removing) {
      attempted = true;
      const result = await session.delete(`${endpoint}/dismissals`, { reviewer_id: String(person.id) });
      if (!result.ok) return failed(result.error);
    }
    const current = await readReview(session, input);
    if (!current.ok) return { ok: false, error: "partial_update", current, attempted };
    if (current.reviewers.length !== desired.size || current.reviewers.some(p => !desired.has(p.id) || desired.get(p.id)!.necessary !== (p.type === "necessary"))) return { ok: false, error: "partial_update", current, attempted };
    return { ok: true, current };
  }));
  server.handle(submitReview, input => api.exclusive(async (): Promise<RpcOutput<typeof submitReview>> => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false, error: "account_changed" };
    const detail = await readDetail(session, input); if (!detail.ok) return detail;
    if (detail.detail.sourceSha !== input.sourceSha || !["opened", "reopened"].includes(detail.detail.state)) return { ok: false, error: "version_changed" };
    const before = await readReview(session, input); if (!before.ok) return before;
    const person = before.reviewers.find(p => p.id === input.accountId);
    if (!person) return { ok: false, error: "forbidden", current: before };
    if (input.event === "approve" && person.state === "approved" && !input.summary) return { ok: true, current: before };
    if (before.revision !== input.revision) return { ok: false, error: "stale_review", current: before };
    const result = await session.put(`/projects/${input.projectId}/merge_request/${input.mrId}/reviewer/summary`, { reviewer_event: input.event, summary: input.summary });
    const current = await readReview(session, input);
    if (!result.ok) return { ok: false, error: ["network_error", "service_error", "invalid_response"].includes(result.error) ? "review_outcome_unknown" : result.error, current, attempted: true };
    if (!current.ok) return { ok: false, error: "review_outcome_unknown", current, attempted: true };
    const after = await readDetail(session, input);
    if (!after.ok || after.detail.sourceSha !== input.sourceSha) return { ok: false, error: "review_outcome_unknown", current, attempted: true };
    const state = current.reviewers.find(p => p.id === input.accountId)?.state;
    const expected = { approve: ["approved"], require_change: ["change_required"], deny: ["change_denied", "denied"] };
    if (!state || input.event !== "comment" && !expected[input.event].includes(state)) return { ok: false, error: "review_outcome_unknown", current, attempted: true };
    return { ok: true, current };
  }));
}
