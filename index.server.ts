import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createGongfengService } from "./server/service.ts";
import { registerGongfengTools } from "./server/agent-tools.ts";

import { workbenchSettings } from "./shared/workbench.ts";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(workbenchSettings);
  const service = createGongfengService();
  service.registerRpc(server);
  const tools = registerGongfengTools(server, service);
  return async () => { tools.dispose(); service.dispose(); };
}
