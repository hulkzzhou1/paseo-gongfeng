import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { apiError } from "./api.ts";
import { mrRef, shaSchema } from "./detail.ts";
const failure = z.object({ ok: z.literal(false), error: z.union([apiError, z.enum(["version_changed", "version_unknown"])]) });
export const mrTapd = defineRpc({ name: "mr.tapd", input: mrRef, output: z.union([failure, z.object({
  ok: z.literal(true), items: z.array(z.object({ id: z.string(), workspaceId: z.string(), kind: z.string(), title: z.string(), status: z.string(), url: z.string().url().nullable() })), incomplete: z.boolean(),
})]) });
export const mrCi = defineRpc({ name: "mr.ci", input: mrRef.extend({ sourceProjectId: z.number().int().positive(), sourceSha: shaSchema, targetBranch: z.string().max(1024), page: z.number().int().min(1).max(10000) }), output: z.union([failure, z.object({
  ok: z.literal(true), sha: shaSchema, state: z.string(), total: z.number().int().nonnegative(),
  items: z.array(z.object({ id: z.number().int().positive(), state: z.string(), context: z.string(), description: z.string(), url: z.string().url().nullable() })),
  nextPage: z.number().int().positive().nullable(), incomplete: z.boolean(),
})]) });
