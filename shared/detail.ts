import { milestoneSummary } from "./milestones.ts";
import { siteReference } from "./site.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { apiError } from "./api.ts";

export const mrRef = z.object({ ...siteReference, projectId: z.number().int().positive(), mrId: z.number().int().positive(), accountId: z.number().int().positive().optional() }).strict();
export const failure = z.object({ ok: z.literal(false), error: apiError });
export const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
export const mrDetailSchema = z.object({
  projectId: z.number().int().positive(), id: z.number().int().positive(), iid: z.number().int().positive(),
  title: z.string(), description: z.string(), descriptionTruncated: z.boolean(), state: z.string(),
  sourceProjectId: z.number().int().positive(), targetProjectId: z.number().int().positive(),
  sourceBranch: z.string(), targetBranch: z.string(),
  sourceSha: shaSchema.nullable(), targetSha: shaSchema.nullable(), baseSha: shaSchema.nullable(),
  milestone: milestoneSummary.nullable().optional(),
  stateRevision: z.string().regex(/^[a-f0-9]{64}$/),
  editRevision: z.string().regex(/^[a-f0-9]{64}$/),
  updatedAt: z.string().nullable(), url: z.string().url().nullable(),
});
export const fileDiffSchema = z.object({
  oldPath: z.string(), newPath: z.string(), diff: z.string(),
  newFile: z.boolean(), deletedFile: z.boolean(), renamedFile: z.boolean(),
  tooLarge: z.boolean(), collapsed: z.boolean(), truncated: z.boolean(),
});
export const reviewContextSchema = z.object({
  detail: mrDetailSchema, files: z.array(fileDiffSchema), fetchedAt: z.string(),
  consistency: z.enum(["verified", "changed", "unknown"]), incomplete: z.boolean(), discussionIncluded: z.literal(false),
});
export const mrDetail = defineRpc({ name: "mr.detail", input: mrRef, output: z.union([failure, z.object({ ok: z.literal(true), detail: mrDetailSchema, fetchedAt: z.string() })]) });
export const mrChanges = defineRpc({ name: "mr.changes", input: mrRef, output: z.union([failure, reviewContextSchema.extend({ ok: z.literal(true) })]) });
export const mrReview = defineRpc({ name: "mr.review", input: mrRef, output: z.union([failure, z.object({
  ok: z.literal(true), reviewId: z.number().int().positive(), mrId: z.number().int().positive(), state: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
  approverRule: z.number().int().min(-1).max(100).nullish(),
  necessaryApproverRule: z.number().int().min(-1).max(100).nullish(),
  reviewers: z.array(z.object({ id: z.number().int().positive(), name: z.string(), username: z.string(), avatarUrl: z.string().url().nullish(), state: z.string(), type: z.string().nullish() })),
})]) });
export const noteSchema = z.object({ id: z.number().int().positive(), parentId: z.number().int().nonnegative().nullable(), body: z.string(), author: z.string(), createdAt: z.string(), system: z.boolean(), truncated: z.boolean() });
export const mrNotes = defineRpc({ name: "mr.notes", input: mrRef.extend({ page: z.number().int().min(1).max(10000) }), output: z.union([failure, z.object({
  ok: z.literal(true), items: z.array(noteSchema), nextPage: z.number().int().positive().nullable(), nestedComplete: z.literal(false), truncated: z.boolean(),
})]) });
export type MrRef = z.infer<typeof mrRef>;
export type MrDetail = z.infer<typeof mrDetailSchema>;
export type ReviewContext = z.infer<typeof reviewContextSchema>;
