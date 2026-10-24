import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { RpcOutput } from "@getpaseo/plugin";
import { changeMrState } from "../shared/mr-state.ts";
import type { GongfengClient } from "./gongfeng.ts";
import { readDetail } from "./detail.ts";

export function registerMrState(server: Pick<PluginServerContext, "handle">, api: GongfengClient) {
  server.handle(changeMrState, input => api.exclusive(async (): Promise<RpcOutput<typeof changeMrState>> => {
    const session = await api.session(input.siteUrl); if (!session.ok) return session;
    if (session.account.id !== input.accountId) return { ok: false, error: "account_changed" };
    const before = await readDetail(session, input); if (!before.ok) return before;
    if (before.detail.stateRevision !== input.revision) return { ok: false, error: "stale_mr_state", current: before.detail };
    const allowed = input.event === "close" ? ["opened", "reopened"] : ["closed"];
    if (!allowed.includes(before.detail.state)) return { ok: false, error: "mr_state_unavailable", current: before.detail };
    const result = await session.put(`/projects/${input.projectId}/merge_request/${input.mrId}`, {}, { state_event: input.event });
    const after = await readDetail(session, input);
    const current = after.ok ? after.detail : undefined;
    if (!result.ok) return { ok: false, error: ["network_error", "service_error", "invalid_response"].includes(result.error) ? "outcome_unknown" : result.error, attempted: true, current };
    const expected = input.event === "close" ? ["closed"] : ["opened", "reopened"];
    if (!current || !expected.includes(current.state)) return { ok: false, error: "outcome_unknown", attempted: true, current };
    return { ok: true, current };
  }));
}
