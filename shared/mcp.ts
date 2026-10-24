import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const mcpSettings = defineSettings({ id: "mcp", scope: "host", version: 1,
  schema: z.object({ enabled: z.boolean().default(false) }).strict(),
});
