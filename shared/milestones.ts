import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { siteReference } from "./site.ts";
import { repositoryError } from "./repositories.ts";

export const milestoneSummary = z.object({ id: z.number().int().positive(), iid: z.number().int().positive(), projectId: z.number().int().positive(), title: z.string(), state: z.string(), dueDate: z.string().nullable() });
export const milestoneSchema = milestoneSummary.extend({ repositoryPath: z.string(), description: z.string(), descriptionTruncated: z.boolean(), updatedAt: z.string().nullable(), revision: z.string() });
export const milestoneError = z.enum([...repositoryError.options, "stale_milestone", "outcome_unknown", "partial_update"]);
export const milestoneFailure = z.object({ ok: z.literal(false), error: milestoneError });
export const milestoneScope = z.object({ ...siteReference, accountId: z.number().int().positive(), projectId: z.number().int().positive() }).strict();
export const milestoneRef = milestoneScope.extend({ milestoneId: z.number().int().positive() });
export const milestoneCursor = z.object({ projectId: z.number().int().positive(), page: z.number().int().min(1).max(10000) });
export const milestonesPage = defineRpc({ name: "milestones.page", input: z.object({ ...siteReference, accountId: z.number().int().positive(), state: z.enum(["all", "active", "closed"]), repositoryId: z.number().int().positive().optional(), cursors: z.array(milestoneCursor).max(500).optional() }).strict(), output: z.union([milestoneFailure, z.object({ ok: z.literal(true), items: z.array(milestoneSchema), next: z.array(milestoneCursor), repositoryCount: z.number(), failures: z.array(z.object({ projectId: z.number(), error: milestoneError })) })]) });
export const milestoneDetail = defineRpc({ name: "milestones.detail", input: milestoneRef, output: z.union([milestoneFailure, z.object({ ok: z.literal(true), milestone: milestoneSchema })]) });
export type Milestone = z.infer<typeof milestoneSchema>;
export type MilestoneReference = z.infer<typeof milestoneRef>;

export const milestoneDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; }, "截止日期无效");
export const milestoneFields = z.object({ title: z.string().trim().min(1).max(255), description: z.string().max(100000), dueDate: milestoneDate.nullable() });
export const saveMilestone = defineRpc({ name: "milestones.save", input: milestoneScope.extend({ ...milestoneFields.shape, description: milestoneFields.shape.description.optional(), dueDate: milestoneFields.shape.dueDate.optional(), milestoneId: z.number().int().positive().optional(), revision: z.string().regex(/^[a-f0-9]{64}$/).optional(), stateEvent: z.enum(["active", "close"]).optional() }).refine(v => v.milestoneId ? !!v.revision : !v.revision && !v.stateEvent && v.description !== undefined && v.dueDate !== undefined), output: z.union([milestoneFailure, z.object({ ok: z.literal(true), milestone: milestoneSchema })]) });
export const deleteMilestone = defineRpc({ name: "milestones.delete", input: milestoneRef.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/), title: z.string() }), output: z.union([milestoneFailure, z.object({ ok: z.literal(true) })]) });

export const milestoneItemKind = z.enum(["issue", "mr"]);
export const milestoneItem = z.object({ kind: milestoneItemKind, id: z.number().int().positive(), iid: z.number().int().positive(), projectId: z.number().int().positive(), title: z.string(), state: z.string(), milestone: z.object({ id: z.number().int().positive(), title: z.string() }).nullable(), url: z.string().url() });
const itemPage = z.object({ ok: z.literal(true), items: z.array(milestoneItem), nextPage: z.number().int().positive().nullable() });
export const milestoneItems = defineRpc({ name: "milestones.items", input: milestoneRef.extend({ kind: milestoneItemKind, page: z.number().int().min(1).max(10000) }), output: z.union([milestoneFailure, itemPage]) });
export const searchMilestoneItems = defineRpc({ name: "milestones.candidates", input: milestoneRef.extend({ kind: milestoneItemKind, page: z.number().int().min(1).max(10000), query: z.string().trim().min(1).max(256) }), output: z.union([milestoneFailure, itemPage]) });
export const milestoneLinkChange = z.object({ kind: milestoneItemKind, id: z.number().int().positive(), originalMilestoneId: z.number().int().positive().nullable(), action: z.enum(["add", "remove"]) }).strict();
export const saveMilestoneLinks = defineRpc({ name: "milestones.links.save", input: milestoneRef.extend({ changes: z.array(milestoneLinkChange).min(1).max(50).refine(items => new Set(items.map(i => `${i.kind}:${i.id}`)).size === items.length), confirmMigration: z.boolean() }), output: z.union([milestoneFailure, z.object({ ok: z.literal(true), complete: z.boolean(), attempted: z.boolean(), results: z.array(z.object({ kind: milestoneItemKind, id: z.number(), ok: z.boolean(), error: milestoneError.optional(), item: milestoneItem.optional() })) })]) });
export type MilestoneItem = z.infer<typeof milestoneItem>;
