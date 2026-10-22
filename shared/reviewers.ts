import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { apiError } from "./api.ts";
import { mrRef, mrReview, shaSchema } from "./detail.ts";
import { siteUrlSchema } from "./site.ts";

export const reviewUser = z.object({ id: z.number().int().positive(), name: z.string(), username: z.string() });
export const reviewerChoice = z.object({ id: z.number().int().positive(), necessary: z.boolean() }).strict();
export const reviewerReference = mrRef.extend({ siteUrl: siteUrlSchema, accountId: z.number().int().positive() });
const error = z.enum([...apiError.options, "stale_review", "partial_update", "reviewer_limit", "version_changed", "review_outcome_unknown"]);
const failure = z.object({ ok: z.literal(false), error, current: mrReview.output.optional(), attempted: z.boolean().optional() });
export const searchReviewers = defineRpc({ name: "reviewers.search", input: reviewerReference.extend({ query: z.string().trim().min(1).max(256), page: z.number().int().min(1).max(10000).default(1) }),
  output: z.union([failure, z.object({ ok: z.literal(true), items: z.array(reviewUser), nextPage: z.number().int().nullable() })]) });
export const saveReviewers = defineRpc({ name: "reviewers.save", input: reviewerReference.extend({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  reviewers: z.array(reviewerChoice).max(100).refine(items => new Set(items.map(p => p.id)).size === items.length, "Duplicate reviewers"),
}).strict(), output: z.union([failure, z.object({ ok: z.literal(true), current: mrReview.output })]) });
export const reviewEvent = z.enum(["approve", "require_change", "deny", "comment"]);
export const submitReview = defineRpc({ name: "review.submit", input: reviewerReference.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/), sourceSha: shaSchema,
  event: reviewEvent, summary: z.string().trim().max(10000).default(""),
}).strict(), output: z.union([failure, z.object({ ok: z.literal(true), current: mrReview.output })]) });
