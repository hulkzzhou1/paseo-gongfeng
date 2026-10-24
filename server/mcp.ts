import type { PluginServerContext } from "@getpaseo/plugin/server";
import { mcpSettings } from "../shared/mcp.ts";
import type { GongfengService } from "./service.ts";
import { startMcpEndpoint } from "./mcp-http.ts";

export function registerGongfengMcp(server: PluginServerContext, service: GongfengService) {
  const settings = server.registerSettings(mcpSettings);
  let enabled = false, disposed = false, changed = false;
  let endpoint: Awaited<ReturnType<typeof startMcpEndpoint>> | undefined;
  let pending = Promise.resolve();
  async function stopEndpoint() {
    const previous = endpoint; endpoint = undefined;
    await previous?.close();
  }
  const synchronize = () => {
    pending = pending.then(async () => {
      await stopEndpoint();
      if (!enabled || disposed) return;
      const key = await service.api.configurationKey();
      if (!key) return;
      const current = await startMcpEndpoint(service, { key, siteUrl: await service.api.siteUrl() });
      if (disposed || !enabled) { await current.close(); return; }
      endpoint = current;
    }).catch(async () => {
      await stopEndpoint();
      if (!disposed) console.error("Gongfeng MCP service unavailable; check connection and toggle settings.");
    });
    return pending;
  };
  const unsubscribe = settings.subscribe(async state => {
    changed = true; enabled = state.status === "ready" && state.values.enabled;
    await synchronize();
  });
  const stopConnection = service.api.onConfigurationChange(synchronize);
  const ready = settings.read().then(async state => {
    if (changed || disposed) return;
    enabled = state.status === "ready" && state.values.enabled;
    await synchronize();
  }).catch(async () => { await stopEndpoint(); });
  const stopHook = server.before("agent.create", async ({ request }, context) => {
    await ready; await pending;
    if (disposed || !enabled || !endpoint || request.config.mcpServers?.["gongfeng-workbench"]) return request;
    const current = endpoint;
    if (!await service.canInjectMcp(request.config.cwd, context) || disposed || !enabled || endpoint !== current) return request;
    service.setHostContext(context);
    return { ...request, config: { ...request.config,
      mcpServers: { ...request.config.mcpServers, "gongfeng-workbench": current.config },
    } };
  });
  return { ready, async dispose() {
    disposed = true; enabled = false;
    unsubscribe(); stopConnection(); stopHook();
    await ready; await pending; await stopEndpoint();
  } };
}
