import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { apiError } from "./api.ts";
import { mrRef, mrDetailSchema } from "./detail.ts";

export const mrEditBody = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(100000).optional(),
}).strict().refine(value => value.title !== undefined || value.description !== undefined, "至少修改标题或描述");

export const editMr = defineRpc({ name: "mr.edit",
  input: mrEditBody.safeExtend({ ...mrRef.shape, accountId: z.number().int().positive(), revision: z.string().regex(/^[a-f0-9]{64}$/) }),
  output: z.union([z.object({ ok: z.literal(true), current: mrDetailSchema }), z.object({ ok: z.literal(false),
    error: z.enum([...apiError.options, "stale_mr_edit", "mr_description_truncated", "outcome_unknown"]), attempted: z.boolean().optional(), current: mrDetailSchema.optional(),
  })]),
});
