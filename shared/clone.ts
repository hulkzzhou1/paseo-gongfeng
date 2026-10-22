import { siteReference } from "./site.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
export const cloneOperationSchema = z.object({
  ...siteReference, id: z.string(), repositoryId: z.number().int().positive(), targetPath: z.string(),
  stage: z.enum(["reserved", "cloning", "cloned", "registered", "completed"]),
  projectId: z.string().optional(), error: z.string().optional(),
});
export const cloneRepository = defineRpc({ name: "repositories.clone", input: z.object({ ...siteReference, repositoryId: z.number().int().positive(), targetPath: z.string().trim().min(1).max(4096).refine(value => !value.includes("\0")) }).strict(), output: z.union([z.object({ ok: z.literal(true), operation: cloneOperationSchema }), z.object({ ok: z.literal(false), error: z.string(), operation: cloneOperationSchema.optional() })]) });
export const listCloneOperations = defineRpc({ name: "repositories.clones", input: z.object({ ...siteReference,}), output: z.union([z.object({ ok: z.literal(true), operations: z.array(cloneOperationSchema) }), z.object({ ok: z.literal(false), error: z.string() })]) });
