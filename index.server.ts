import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createGongfengService } from "./server/service.ts";
import { registerGongfengMcp } from "./server/mcp.ts";

export default function contribute(server: PluginServerContext) {
  const service = createGongfengService();
  service.registerRpc(server);
  const mcp = typeof server.before === "function" && typeof server.registerSettings === "function" ? registerGongfengMcp(server, service) : undefined;
  return async () => { service.dispose(); await mcp?.dispose(); };
}
