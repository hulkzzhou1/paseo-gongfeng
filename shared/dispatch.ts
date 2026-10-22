import { siteReference } from "./site.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { mrRef, shaSchema } from "./detail.ts";
export const reviewProfileSchema = z.object({ id: z.string(), name: z.string(), provider: z.string(), model: z.string().optional(), modeId: z.string().optional(), thinkingOptionId: z.string().optional() });
export const reviewOperationSchema = z.object({
  ...siteReference, id: z.uuid(), reference: mrRef, accountId: z.number().int().positive(), title: z.string(), iid: z.number().int().positive(),
  sourceSha: shaSchema.nullable(), baseSha: shaSchema.nullable(), targetSha: shaSchema.nullable(), fetchedAt: z.string(),
  consistency: z.enum(["verified", "changed", "unknown"]), incomplete: z.boolean(),
  stage: z.enum(["prepared", "preparing_code", "code_failed", "code_ready", "workspace_creating", "workspace_ready", "agent_creating", "completed"]),
  mode: z.enum(["full", "diff"]).optional(), projectId: z.string().optional(), profileId: z.string().optional(), requirements: z.string().optional(),
  directory: z.string().optional(), workspaceId: z.string().optional(), agentId: z.string().optional(), error: z.string().optional(),
  canDowngrade: z.boolean(), limitations: z.array(z.string()),
});
const failure = z.object({ ok: z.literal(false), error: z.string(), operation: reviewOperationSchema.optional() });
export const prepareReview = defineRpc({ name: "review.prepare", input: mrRef.extend({ operationId: z.uuid().optional() }), output: z.union([failure, z.object({ ok: z.literal(true), operation: reviewOperationSchema, projects: z.array(z.object({ id: z.string(), name: z.string(), rootPath: z.string() })), profiles: z.array(reviewProfileSchema) })]) });
export const startReview = defineRpc({ name: "review.start", input: z.object({ ...siteReference, operationId: z.uuid(), projectId: z.string().min(1).optional(), profileId: z.string().min(1), requirements: z.string().max(10000).default(""), mode: z.enum(["full", "diff"]).default("full") }).strict(), output: z.union([failure, z.object({ ok: z.literal(true), operation: reviewOperationSchema })]) });
export const reviewHistory = defineRpc({ name: "review.history", input: mrRef, output: z.union([failure, z.object({ ok: z.literal(true), operations: z.array(reviewOperationSchema) })]) });
export type ReviewOperation = z.infer<typeof reviewOperationSchema>;
