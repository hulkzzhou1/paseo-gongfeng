import type { PluginServerContext } from "@getpaseo/plugin/server";
import { connectionStatus, saveConnection } from "../shared/connection.ts";
import type { GongfengClient } from "./gongfeng.ts";

export function registerConnection(server: PluginServerContext, api: GongfengClient) {
  server.handle(connectionStatus, async () => {
    const result = await api.session();
    if (result.ok) return { status: "connected" as const, account: result.account, siteUrl: result.siteUrl };
    if (result.error === "unconfigured") return { status: "unconfigured" as const };
    let siteUrl: string | undefined;
    try { siteUrl = await api.siteUrl(); } catch {}
    return { status: "error" as const, error: connectionError(result.error), ...(siteUrl ? { siteUrl } : {}) };
  });
  server.handle(saveConnection, async ({ token, siteUrl }) => {
    const result = await api.save(token, siteUrl);
    return result.ok ? result : { ok: false as const, error: connectionError(result.error) };
  });
}

function connectionError(error: import("../shared/api.ts").ApiError): "unauthorized" | "forbidden" | "network_error" | "invalid_response" | "storage_error" | "service_error" {
  return error === "unauthorized" || error === "forbidden" || error === "network_error" || error === "invalid_response" || error === "storage_error" ? error : "service_error";
}
