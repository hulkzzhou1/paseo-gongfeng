import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { RpcOutput } from "@getpaseo/plugin";
import { z } from "zod";
import { mrDetail, mrChanges, mrReview, mrNotes, shaSchema, type MrRef } from "../shared/detail.ts";
import type { GongfengClient } from "./gongfeng.ts";

export type GongfengSession = Extract<Awaited<ReturnType<GongfengClient["session"]>>, { ok: true }>;
const rawDetail = z.object({
  id: z.number().int().positive(), iid: z.number().int().positive(), title: z.string(), description: z.string().nullable().default(""), state: z.string(),
  source_project_id: z.number().int().positive(), target_project_id: z.number().int().positive(), source_branch: z.string(), target_branch: z.string(),
  source_commit: z.unknown().optional(), base_commit: z.unknown().optional(), target_commit: z.unknown().optional(), updated_at: z.string().nullable().optional(),
});
const projectPath = z.object({ id: z.number().int().positive(), path_with_namespace: z.string().min(1) });
const invalid = { ok: false as const, error: "invalid_response" as const };
const endpoint = (ref: MrRef) => `/projects/${ref.projectId}/merge_request/${ref.mrId}`;

export async function readDetail(session: GongfengSession, ref: MrRef): Promise<RpcOutput<typeof mrDetail>> {
  const result = await session.get(endpoint(ref));
  if (!result.ok) return result;
  const parsed = rawDetail.safeParse(result.data);
  if (!parsed.success || parsed.data.id !== ref.mrId || parsed.data.target_project_id !== ref.projectId) return invalid;
  const data = parsed.data;
  const project = await session.get(`/projects/${ref.projectId}`);
  const path = project.ok ? projectPath.safeParse(project.data) : null;
  const url = path?.success && path.data.id === ref.projectId
    ? `${session.siteUrl}/${path.data.path_with_namespace.split("/").map(encodeURIComponent).join("/")}/merge_requests/${data.iid}` : null;
  return { ok: true, fetchedAt: new Date().toISOString(), detail: {
    projectId: ref.projectId, id: data.id, iid: data.iid, title: data.title, description: (data.description ?? "").slice(0, 100000), descriptionTruncated: (data.description?.length ?? 0) > 100000, state: data.state,
    sourceProjectId: data.source_project_id, targetProjectId: data.target_project_id,
    sourceBranch: data.source_branch, targetBranch: data.target_branch,
    sourceSha: shaSchema.safeParse(data.source_commit).success ? data.source_commit as string : null,
    baseSha: shaSchema.safeParse(data.base_commit).success ? data.base_commit as string : null,
    targetSha: shaSchema.safeParse(data.target_commit).success ? data.target_commit as string : null,
    updatedAt: data.updated_at ?? null, url,
  } };
}

const rawChanges = z.object({
  id: z.number().int().positive().optional(), iid: z.number().int().positive().optional(),
  source_project_id: z.number().int().positive().optional(), target_project_id: z.number().int().positive().optional(),
  source_branch: z.string().optional(), target_branch: z.string().optional(), updated_at: z.string().nullable().optional(),
  files: z.array(z.object({
    old_path: z.string(), new_path: z.string(), diff: z.string().nullable().optional(),
    new_file: z.boolean().default(false), deleted_file: z.boolean().default(false), renamed_file: z.boolean().default(false),
    is_too_large: z.boolean().default(false), is_collapse: z.boolean().default(false),
  })),
});
const versionFields = ["id", "iid", "sourceProjectId", "targetProjectId", "sourceBranch", "targetBranch", "sourceSha", "targetSha", "baseSha", "updatedAt"] as const;

export async function readReviewContext(session: GongfengSession, ref: MrRef): Promise<RpcOutput<typeof mrChanges>> {
  const before = await readDetail(session, ref);
  if (!before.ok) return before;
  const changes = await session.get(`${endpoint(ref)}/changes`);
  if (!changes.ok) return changes;
  const parsed = rawChanges.safeParse(changes.data);
  if (!parsed.success) return invalid;
  const after = await readDetail(session, ref);
  if (!after.ok) return after;
  const detail = before.detail;
  const meta = parsed.data;
  const identityPairs = [
    [meta.id, detail.id], [meta.iid, detail.iid], [meta.source_project_id, detail.sourceProjectId],
    [meta.target_project_id, detail.targetProjectId], [meta.source_branch, detail.sourceBranch],
    [meta.target_branch, detail.targetBranch], [meta.updated_at, detail.updatedAt],
  ];
  const changed = versionFields.some((key) => detail[key] !== after.detail[key]) || identityPairs.some(([actual, expected]) => actual != null && actual !== expected);
  const known = detail.sourceSha && detail.targetSha && detail.baseSha && detail.updatedAt && identityPairs.every(([actual]) => actual != null);
  const consistency = changed ? "changed" : known ? "verified" : "unknown";
  let remaining = 1000000;
  const files = changed ? [] : meta.files.slice(0, 1000).map((file) => {
    const raw = file.diff ?? "";
    const diff = raw.slice(0, Math.min(200000, remaining));
    remaining -= diff.length;
    return { oldPath: file.old_path, newPath: file.new_path, diff,
      newFile: file.new_file, deletedFile: file.deleted_file, renamedFile: file.renamed_file,
      tooLarge: file.is_too_large, collapsed: file.is_collapse, truncated: file.diff == null || diff.length < raw.length };
  });
  return { ok: true, detail, files, fetchedAt: new Date().toISOString(), consistency, discussionIncluded: false,
    incomplete: detail.descriptionTruncated || consistency !== "verified" || files.length < meta.files.length || files.some(f => f.tooLarge || f.collapsed || f.truncated) };
}

const rawNote = z.object({
  id: z.number().int().positive(), parent_id: z.number().int().nonnegative().nullable().optional(), body: z.string(),
  author: z.object({ name: z.string() }).nullable().optional(), created_at: z.string().default(""),
  system: z.boolean().default(false), comments: z.array(z.unknown()).nullable().optional(),
});

export async function readNotes(session: GongfengSession, ref: MrRef, page: number): Promise<RpcOutput<typeof mrNotes>> {
  const result = await session.get(`/projects/${ref.projectId}/merge_requests/${ref.mrId}/notes`, { page: String(page), per_page: "20", sort: "created_asc" });
  if (!result.ok) return result;
  if (!Array.isArray(result.data)) return invalid;
  const items: Extract<RpcOutput<typeof mrNotes>, { ok: true }>["items"] = [];
  let truncated = false;
  let remaining = 200000;
  let invalidNote = false;
  function append(raw: unknown, parent: number | null, depth: number) {
    if (items.length >= 200 || depth > 5) { truncated = true; return; }
    const parsed = rawNote.safeParse(raw);
    if (!parsed.success) { invalidNote = true; return; }
    const note = parsed.data;
    const body = note.body.slice(0, Math.min(20000, remaining)); remaining -= body.length;
    const shortened = body.length < note.body.length;
    truncated ||= shortened;
    items.push({ id: note.id, parentId: note.parent_id ?? parent, body, author: note.author?.name ?? "未知作者", createdAt: note.created_at, system: note.system, truncated: shortened });
    for (const reply of note.comments ?? []) append(reply, note.id, depth + 1);
  }
  for (const note of result.data) append(note, null, 0);
  if (invalidNote) return invalid;
  const next = result.headers.get("X-Next-Page");
  const nextPage = next === null ? (result.data.length >= 20 ? page + 1 : null) : next === "" ? null : Number(next);
  if (nextPage !== null && (!Number.isInteger(nextPage) || nextPage <= page || nextPage > 10000)) return invalid;
  return { ok: true, items: [...new Map(items.map(n => [n.id, n])).values()], nextPage, nestedComplete: false, truncated };
}

const rawReview = z.object({
  id: z.number().int().positive(), reviewable_id: z.number().int().positive(), reviewable_type: z.literal("merge_request"), state: z.string(),
  reviewers: z.array(z.object({ id: z.number().int().positive(), username: z.string(), name: z.string(), review_state: z.string() })),
});

export async function readReview(session: GongfengSession, ref: MrRef): Promise<RpcOutput<typeof mrReview>> {
  const result = await session.get(`${endpoint(ref)}/review`);
  if (!result.ok) return result;
  const parsed = rawReview.safeParse(result.data);
  if (!parsed.success || parsed.data.reviewable_id !== ref.mrId) return invalid;
  return { ok: true, reviewId: parsed.data.id, mrId: parsed.data.reviewable_id, state: parsed.data.state,
    reviewers: parsed.data.reviewers.map(r => ({ id: r.id, username: r.username, name: r.name, state: r.review_state })) };
}

export function registerDetail(server: PluginServerContext, api: GongfengClient) {
  server.handle(mrReview, async (ref) => {
    const session = await api.session(ref.siteUrl);
    if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    return readReview(session, ref);
  });
  server.handle(mrNotes, async (ref) => {
    const session = await api.session(ref.siteUrl);
    if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    return readNotes(session, ref, ref.page);
  });
  server.handle(mrChanges, async (ref) => {
    const session = await api.session(ref.siteUrl);
    if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    return readReviewContext(session, ref);
  });
  server.handle(mrDetail, async (ref) => {
    const session = await api.session(ref.siteUrl);
    if (!session.ok) return session;
    if (ref.accountId !== undefined && ref.accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    return readDetail(session, ref);
  });
}
