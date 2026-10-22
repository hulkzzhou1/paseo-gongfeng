import { siteReference, legacySite, siteUrlSchema } from "./site.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const repositorySchema = z.object({
  id: z.number().int().positive(), path: z.string().min(1), name: z.string(),
});
export const bindingSchema = z.object({ daemonId: z.string().min(1), instance: z.string().refine(value => value === new URL(legacySite).host || siteUrlSchema.safeParse(value).success), projectId: z.string().min(1), repository: repositorySchema });
export const managedRepositorySchema = bindingSchema.omit({ projectId: true });
export const repositoryError = z.enum(["unconfigured", "unauthorized", "forbidden", "not_found", "rate_limited", "network_error", "service_error", "invalid_response", "storage_error", "account_changed", "host_error", "project_missing", "conflict", "stale_binding"]);
const failure = z.object({ ok: z.literal(false), error: repositoryError, existing: bindingSchema.optional() });
const projectSchema = z.object({ id: z.string(), name: z.string(), rootPath: z.string(), matches: z.boolean() });
export const listManagedRepositories = defineRpc({ name: "repositories.managed", input: z.object({ ...siteReference,}).strict(), output: z.union([failure, z.object({ ok: z.literal(true), items: z.array(repositorySchema) })]) });
export const addManagedRepository = defineRpc({ name: "repositories.add", input: z.object({ ...siteReference, repositoryId: z.number().int().positive() }).strict(), output: z.union([failure, z.object({ ok: z.literal(true), repository: repositorySchema })]) });
export const searchRepositories = defineRpc({ name: "repositories.search", input: z.object({ ...siteReference, query: z.string().trim().max(256), page: z.number().int().min(1).max(10000).default(1) }), output: z.union([failure, z.object({ ok: z.literal(true), items: z.array(repositorySchema), nextPage: z.number().int().nullable() })]) });
export const listRepositoryBindings = defineRpc({ name: "repositories.bindings", input: z.object({ ...siteReference, repositoryId: z.number().int().positive().optional() }), output: z.union([failure, z.object({ ok: z.literal(true), bindings: z.array(bindingSchema.extend({ status: z.enum(["valid", "project_missing", "remote_changed", "access_unverified"]), error: repositoryError.optional() })), projects: z.array(projectSchema) })]) });
export const bindRepository = defineRpc({ name: "repositories.bind", input: z.object({ ...siteReference, repositoryId: z.number().int().positive(), projectId: z.string().min(1).max(256), replaceRepositoryId: z.number().int().positive().optional() }).strict(), output: z.union([failure, z.object({ ok: z.literal(true), binding: bindingSchema })]) });
export const unbindRepository = defineRpc({ name: "repositories.unbind", input: z.object({ ...siteReference, projectId: z.string().min(1).max(256), repositoryId: z.number().int().positive() }).strict(), output: z.union([failure, z.object({ ok: z.literal(true) })]) });
