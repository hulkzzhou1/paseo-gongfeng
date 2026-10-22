import type { PluginServerContext } from "@getpaseo/plugin/server";
import { z } from "zod";
import { boardPage } from "../shared/board.ts";
import type { registerRepositories } from "./repositories.ts";
import type { GongfengClient } from "./gongfeng.ts";

const mergeRequestSchema = z.object({ id: z.number().int().positive(), iid: z.number().int().positive(), title: z.string(), state: z.string().min(1),
  author: z.object({ username: z.string().nullable().optional() }).nullable().optional(),
});
const groupsSchema = z.array(z.object({
  project: z.object({ id: z.number().int().positive(), path_with_namespace: z.string().min(1) }),
  merge_requests: z.array(mergeRequestSchema),
}));

export function registerBoard(server: PluginServerContext, api: GongfengClient, repositories: ReturnType<typeof registerRepositories>) {
  server.handle(boardPage, async ({ relation, state, search, page, accountId, repositoryId, siteUrl }, context) => {
    const session = await api.session(siteUrl);
    if (!session.ok) return session;
    if (accountId !== undefined && accountId !== session.account.id) return { ok: false as const, error: "account_changed" as const };
    let repository: { id: number; path: string } | undefined;
    if (repositoryId !== undefined) {
      const linked = await repositories.list({ repositoryId, siteUrl: session.siteUrl }, context);
      if (!linked.ok) return linked;
      if (!linked.bindings.length) return { ok: false as const, error: "stale_binding" as const };
      repository = linked.bindings[0]!.repository;
    }
    const pageSize = search ? 100 : 20;
    // Scope the request before pagination; filtering a global first page can hide every MR in this repository.
    const scoped = relation === "all" && repository;
    const result = scoped ? await session.get(`/projects/${scoped.id}/merge_requests`, {
      ...(state === "all" || state === "opened" ? {} : { state }),
      page: String(page), per_page: String(pageSize), order_by: "updated_at", sort: "desc",
    }) : await session.get("/dashboard/merge_requests", {
      ...(relation === "all" ? {} : { [relation === "authored" ? "author_user_name" : "reviewer_user_name"]: session.account.username }),
      state: state === "opened" ? "all" : state, page: String(page), per_page: String(pageSize), sort: "updated_desc",
    });
    if (!result.ok) return result;
    const projectItems = scoped ? z.array(mergeRequestSchema).safeParse(result.data) : undefined;
    if (projectItems && !projectItems.success) return { ok: false as const, error: "invalid_response" as const };
    const parsed = groupsSchema.safeParse(scoped && projectItems?.success ? [{ project: { id: scoped.id, path_with_namespace: scoped.path }, merge_requests: projectItems.data }] : result.data);
    if (!parsed.success) return { ok: false as const, error: "invalid_response" as const };
    const items = parsed.data.flatMap(({ project, merge_requests }) => merge_requests.map(({ author, ...mr }) => ({
      projectId: project.id, projectPath: project.path_with_namespace, ...mr,
      authorUsername: author?.username?.trim() || null,
      url: `${session.siteUrl}/${project.path_with_namespace.split("/").map(encodeURIComponent).join("/")}/merge_requests/${mr.iid}`,
    })));
    const nextHeader = result.headers.get("X-Next-Page");
    const nextPage = nextHeader === null ? (items.length >= pageSize ? page + 1 : null)
      : nextHeader === "" ? null : Number(nextHeader);
    if (nextPage !== null && (!Number.isInteger(nextPage) || nextPage <= page || nextPage > 10000)) return { ok: false as const, error: "invalid_response" as const };
    // Dashboard's reopened filter returned opened records; scan all states to avoid omissions.
    // Dashboard ignores search on known deployments; filter each raw page and retain its continuation.
    const keyword = search.toLocaleLowerCase();
    const visible = items.filter(mr => (repositoryId === undefined || mr.projectId === repositoryId)
      && (state !== "opened" || !["merged", "closed"].includes(mr.state))
      && (!keyword || `${mr.title}\n${mr.projectPath}\n!${mr.iid}\n#${mr.iid}\n@${mr.authorUsername ?? ""}`.toLocaleLowerCase().includes(keyword)));
    return { ok: true as const, accountId: session.account.id, scanned: items.length,
      items: [...new Map(visible.map((mr) => [`${mr.projectId}:${mr.id}`, mr])).values()], nextPage };
  });
}
