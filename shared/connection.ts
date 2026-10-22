import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { siteUrlSchema } from "./site.ts";

export const accountSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1).max(256),
  name: z.string().max(256),
});

export const connectionError = z.enum([
  "unauthorized", "forbidden", "network_error", "service_error", "invalid_response", "storage_error",
]);

export const connectionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unconfigured") }),
  z.object({ status: z.literal("connected"), account: accountSchema, siteUrl: siteUrlSchema }),
  z.object({ status: z.literal("error"), error: connectionError, siteUrl: siteUrlSchema.optional() }),
]);

export const connectionStatus = defineRpc({
  name: "connection.status",
  input: z.object({}),
  output: connectionSchema,
});

export const tokenSchema = z.string().trim().min(1).max(4096).regex(/^[\x21-\x7e]+$/);

export const saveConnection = defineRpc({
  name: "connection.save",
  input: z.object({ token: tokenSchema.optional(), siteUrl: siteUrlSchema.optional() }).strict(),
  output: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), account: accountSchema, siteUrl: siteUrlSchema }),
    z.object({ ok: z.literal(false), error: connectionError }),
  ]),
});
