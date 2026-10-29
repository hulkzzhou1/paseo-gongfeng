import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { RpcOutput } from "@getpaseo/plugin";
import { editMr } from "../shared/mr-edit.ts";
import { readDetail } from "./detail.ts";
import type { GongfengClient } from "./gongfeng.ts";

export function registerMrEdit(server: Pick<PluginServerContext, "handle">, api: GongfengClient) {
  server.handle(editMr, input => api.exclusive(async (): Promise<RpcOutput<typeof editMr>> => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false, error: "account_changed" };
    const before = await readDetail(session, input); if (!before.ok) return before;
    if (before.detail.editRevision !== input.revision) return { ok: false, error: "stale_mr_edit", current: before.detail };
    if (input.description !== undefined && before.detail.descriptionTruncated) return { ok: false, error: "mr_description_truncated", current: before.detail };
    const body = { ...(input.title !== undefined && input.title !== before.detail.title ? { title: input.title } : {}),
      ...(input.description !== undefined && input.description !== before.detail.description ? { description: input.description } : {}) };
    if (!Object.keys(body).length) return { ok: true, current: before.detail };
    // shortcut: no verified upstream atomic revision condition; adopt conditional writes when documented.
    const result = await session.put(`/projects/${input.projectId}/merge_request/${input.mrId}`, body);
    const after = await readDetail(session, input);
    const current = after.ok ? after.detail : undefined;
    if (!result.ok) return { ok: false, error: ["network_error", "service_error", "invalid_response"].includes(result.error) ? "outcome_unknown" : result.error, attempted: true, current };
    if (!current || input.title !== undefined && current.title !== input.title || input.description !== undefined && (current.descriptionTruncated || current.description !== input.description)) return { ok: false, error: "outcome_unknown", attempted: true, current };
    return { ok: true, current };
  }));
}
