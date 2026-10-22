import { siteReference } from "./site.ts";
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { repositoryError } from "./repositories.ts";

export const mrSummary = z.object({
  projectId: z.number().int().positive(), projectPath: z.string(),
  id: z.number().int().positive(), iid: z.number().int().positive(),
  title: z.string(), state: z.string(), url: z.string().url(),
  authorUsername: z.string().nullable(),
});
export const boardRelation = z.enum(["authored", "reviewing"]);
export const boardState = z.enum(["opened", "merged", "closed", "all"]);
export const boardPage = defineRpc({
  name: "board.page",
  input: z.object({ ...siteReference, relation: boardRelation, state: boardState, page: z.number().int().min(1).max(10000), accountId: z.number().int().positive().optional(), repositoryId: z.number().int().positive().optional() }).strict(),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), accountId: z.number().int().positive(), items: z.array(mrSummary), nextPage: z.number().int().positive().nullable(), scanned: z.number().int().nonnegative() }),
    z.object({ ok: z.literal(false), error: repositoryError }),
  ]),
});
