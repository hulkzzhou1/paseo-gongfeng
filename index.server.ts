import type { PluginServerContext } from "@getpaseo/plugin/server";
import { registerMilestones } from "./server/milestones.ts";
import { registerAdditions } from "./server/additions.ts";
import { registerClone } from "./server/clone.ts";
import { registerRepositories } from "./server/repositories.ts";
import { registerConnection } from "./server/connection.ts";
import { createGongfengClient } from "./server/gongfeng.ts";
import { registerDetail } from "./server/detail.ts";
import { registerBoard } from "./server/board.ts";
import { registerReviewers } from "./server/reviewers.ts";

export default function contribute(server: PluginServerContext) {
  const api = createGongfengClient();
  registerConnection(server, api);
  registerDetail(server, api);
  registerReviewers(server, api);
  registerAdditions(server, api);
  const repositories = registerRepositories(server, api);
  registerBoard(server, api, repositories);
  registerMilestones(server, api, repositories);
  const stopClone = registerClone(server, api, repositories);
  return () => { stopClone(); api.dispose(); };
}
