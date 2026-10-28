import { defineAgentTool, type PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { agentToolsSettings } from "../shared/agent-tools.ts";
import { gongfengTools } from "./agent-tool-definitions.ts";
import type { GongfengService } from "./service.ts";

export function createGongfengAgentTools(service: GongfengService, scope: { key: string; siteUrl: string; active(): boolean }) {
  return gongfengTools.map(tool => defineAgentTool({
    name: `gongfeng_${tool.name}`,
    description: `${tool.description} ${tool.write ? "Write operation: obtain explicit user authorization and pass confirm:true. " : "Read-only operation. "}${tool.destructive ? "Can replace or remove existing data. " : ""}Inputs are nested under input. Never read private configuration files or supply tokens.`,
    input: z.object({ input: (tool.contract.input as z.ZodObject).strict(), ...(tool.write ? { confirm: z.literal(true) } : {}) }).strict(),
    async execute({ input }, { agent, paseo, signal }) {
      const active = () => scope.active() && !signal.aborted;
      const authorizeWrite = () => service.canUseAgentTools(agent.cwd, { paseo });
      try {
        if (!active() || await service.api.configurationKey() !== scope.key || !await authorizeWrite()) throw new Error("Unavailable");
        if (input.siteUrl !== undefined && input.siteUrl !== scope.siteUrl) throw new Error("Connection changed");
        const result = await service.api.withConfiguration(scope.key, () => service.execute(tool.contract,
          { ...input, ...(tool.name === "connection_status" ? {} : { siteUrl: scope.siteUrl }) }, { paseo }), active, signal, authorizeWrite);
        if (!active()) throw new Error("Canceled");
        const failed = typeof result === "object" && result !== null && ("ok" in result && !result.ok || "status" in result && result.status === "error");
        return { structuredContent: { result }, ...(failed ? { isError: true } : {}) };
      } catch {
        return { isError: true, text: "Gongfeng operation could not be confirmed. Check tool access, project association and connection, then read back state before retrying; writes may have partially succeeded." };
      }
    },
  }));
}

export function registerGongfengTools(server: PluginServerContext, service: GongfengService) {
  if (typeof defineAgentTool !== "function") throw new Error("Gongfeng Agent tools require Paseo main with defineAgentTool support.");
  const settings = server.registerSettings(agentToolsSettings);
  let enabled = false, disposed = false, changed = false, generation = 0;
  const unsubscribe = settings.subscribe(state => {
    changed = true; generation++;
    enabled = state.status === "ready" && state.values.enabled;
  });
  const stopConnection = service.api.onConfigurationChange(async () => { generation++; });
  const ready = settings.read().then(state => {
    if (!changed && !disposed) enabled = state.status === "ready" && state.values.enabled;
  }).catch(() => { if (!changed) enabled = false; });
  const stopHook = server.before("agent.session_open", async ({ request }, context) => {
    await ready;
    if (disposed || !enabled || request.purpose === "history") return request;
    const version = generation, key = await service.api.configurationKey();
    if (!key || !await service.canUseAgentTools(request.cwd, context)) return request;
    const siteUrl = await service.api.siteUrl();
    const active = () => !disposed && enabled && generation === version;
    if (!active() || await service.api.configurationKey() !== key) return request;
    return { ...request, tools: [...request.tools, ...createGongfengAgentTools(service, { key, siteUrl, active })] };
  });
  return { ready, dispose() {
    disposed = true; enabled = false; generation++;
    unsubscribe(); stopConnection(); stopHook();
  } };
}
