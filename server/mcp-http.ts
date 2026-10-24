import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { once } from "node:events";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema, McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { gongfengTools } from "./mcp-tools.ts";
import type { GongfengService } from "./service.ts";

export async function startMcpEndpoint(service: GongfengService, scope: { key: string | null; siteUrl: string }) {
  const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
  let closed = false;
  const active = new Set<Server>();
  const server = createServer(async (request, response) => {
    const received = Buffer.from(request.headers.authorization ?? ""), expected = Buffer.from(authorization);
    if (closed || received.length !== expected.length || !timingSafeEqual(received, expected)) { response.writeHead(401).end(); return; }
    const address = server.address();
    const origin = address && typeof address !== "string" ? `http://127.0.0.1:${address.port}` : "";
    if (request.url !== "/mcp" || request.headers.host !== origin.slice(7) || request.headers.origin && request.headers.origin !== origin) { response.writeHead(403).end(); return; }
    if (request.method !== "POST") { response.writeHead(405, { Allow: "POST" }).end(); return; }
    let mcp: Server | undefined;
    try {
      if (await service.api.configurationKey() !== scope.key) { response.writeHead(401).end(); return; }
      mcp = new Server({ name: "gongfeng", version: "0.3.0" }, { capabilities: { tools: {} } });
      active.add(mcp);
      const definitions = gongfengTools.map(tool => ({ ...tool,
        schema: z.object({ input: (tool.contract.input as z.ZodObject).strict(), ...(tool.write ? { confirm: z.literal(true) } : {}) }).strict(),
      }));
      mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions.map(tool => ({
        name: tool.name,
        description: `${tool.description} ${tool.write ? "Only call with explicit user authorization and confirm:true. " : ""}Inputs are nested under input; do not read private configuration files or supply tokens.`,
        // Input-side JSON Schema describes accepted values before Zod normalizes site URLs.
        inputSchema: z.toJSONSchema(tool.schema, { io: "input" }) as { type: "object" },
        outputSchema: z.toJSONSchema(z.object({ result: tool.contract.output }), { io: "input" }) as { type: "object" },
        annotations: { readOnlyHint: !tool.write, destructiveHint: !!tool.destructive, idempotentHint: !tool.write, openWorldHint: true },
      })) }));
      mcp.setRequestHandler(CallToolRequestSchema, async request => {
        const tool = definitions.find(tool => tool.name === request.params.name);
        if (!tool) throw new McpError(ErrorCode.InvalidParams, "Unknown Gongfeng tool");
        const parsed = tool.schema.safeParse(request.params.arguments);
        if (!parsed.success) throw new McpError(ErrorCode.InvalidParams, "Invalid tool input; writes require confirm:true and the current identity/revision");
        const input = parsed.data.input as Record<string, unknown>;
        try {
          if (closed || await service.api.configurationKey() !== scope.key) throw new Error("Gongfeng connection changed");
          if (input.siteUrl !== undefined && input.siteUrl !== scope.siteUrl) throw new Error("Gongfeng connection changed");
          const run = () => service.execute(tool.contract, { ...input, ...(tool.name === "connection_status" ? {} : { siteUrl: scope.siteUrl }) });
          const result = scope.key ? await service.api.withConfiguration(scope.key, run, () => !closed) : await run();
          const failed = typeof result === "object" && result !== null && ("ok" in result && !result.ok || "status" in result && result.status === "error");
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: { result }, ...(failed ? { isError: true } : {}) };
        } catch {
          return { isError: true, content: [{ type: "text" as const, text: "Gongfeng operation could not be confirmed. Check the connection and refresh state before retrying; writes may have partially succeeded." }] };
        }
      });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      const current = mcp;
      response.on("close", () => { active.delete(current); void current.close().catch(() => {}); });
      await mcp.connect(transport);
      await transport.handleRequest(request, response);
    } catch {
      if (!response.headersSent) response.writeHead(500).end(); else response.end();
      if (mcp) { active.delete(mcp); await mcp.close().catch(() => {}); }
    }
  });
  server.requestTimeout = 30_000;
  server.on("clientError", (_error, socket) => socket.destroy());
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("MCP listener unavailable");
  return { config: { type: "http" as const, url: `http://127.0.0.1:${address.port}/mcp`, headers: { authorization } },
    async close() {
      if (closed) return; closed = true;
      const stopped = new Promise<void>(resolve => server.close(() => resolve()));
      server.closeAllConnections();
      await Promise.allSettled([...active].map(mcp => mcp.close())); await stopped;
    },
  };
}
