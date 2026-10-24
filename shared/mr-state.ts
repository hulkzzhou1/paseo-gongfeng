import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { apiError } from "./api.ts";
import { mrRef, mrDetailSchema } from "./detail.ts";

export const changeMrState = defineRpc({ name: "mr.state.change",
  input: mrRef.extend({ accountId: z.number().int().positive(), revision: z.string().regex(/^[a-f0-9]{64}$/), event: z.enum(["close", "reopen"]) }),
  output: z.union([z.object({ ok: z.literal(true), current: mrDetailSchema }), z.object({ ok: z.literal(false),
    error: z.enum([...apiError.options, "stale_mr_state", "mr_state_unavailable", "outcome_unknown"]), attempted: z.boolean().optional(), current: mrDetailSchema.optional(),
  })]),
});
