import type { PluginRpcContract } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { createGongfengClient } from "./gongfeng.ts";
import { registerConnection } from "./connection.ts";
import { registerDetail } from "./detail.ts";
import { registerMrState } from "./mr-state.ts";
import { registerReviewers } from "./reviewers.ts";
import { registerAdditions } from "./additions.ts";
import { registerRepositories } from "./repositories.ts";
import { registerBoard } from "./board.ts";
import { registerMilestones } from "./milestones.ts";
import { registerIssues } from "./issues.ts";
import { registerClone } from "./clone.ts";

// One set of business handlers and write queues serves both UI RPC and explicit Agent tools.
export function createGongfengService() {
  const api = createGongfengClient();
  const operations = new Map<string, { contract: PluginRpcContract; run(input: unknown, context: PluginHandlerContext): unknown }>();
  const registrar: Pick<PluginServerContext, "handle"> = { handle(contract, handler) {
    operations.set(contract.name, { contract, run: (input, context) => handler(contract.input.parse(input), context) });
  } };
  registerConnection(registrar, api);
  registerDetail(registrar, api);
  registerReviewers(registrar, api);
  registerMrState(registrar, api);
  registerAdditions(registrar, api);
  const repositories = registerRepositories(registrar, api);
  registerBoard(registrar, api, repositories);
  registerMilestones(registrar, api, repositories);
  registerIssues(registrar, api, repositories);
  const stopClone = registerClone(registrar, api, repositories);
  const context: PluginHandlerContext = { get paseo(): PluginHandlerContext["paseo"] { throw new Error("Host context required"); } };
  const execute = async (contract: PluginRpcContract, input: unknown, caller = context) => {
    const operation = operations.get(contract.name);
    if (!operation || operation.contract !== contract) throw new Error("Unknown business operation");
    return contract.output.parse(await operation.run(input, caller));
  };
  return { api, execute, canUseAgentTools: repositories.canUseAgentTools,
    registerRpc(server: Pick<PluginServerContext, "handle">) {
      for (const { contract } of operations.values()) server.handle(contract, (input, caller) => {
        return execute(contract, input, caller);
      });
    },
    dispose() { stopClone(); api.dispose(); },
  };
}
export type GongfengService = ReturnType<typeof createGongfengService>;
