import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// Keep the stored ID so existing Agent-access preferences survive transport removal.
export const agentToolsSettings = defineSettings({ id: "mcp", scope: "host", version: 1,
  schema: z.object({ enabled: z.boolean().default(false) }).strict(),
});
