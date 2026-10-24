// Uses a Paseo checkout's isolated test daemon and fake provider; never a configured host.
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const checkout = process.argv[2];
assert(checkout, "Usage: node scripts/verify-mcp-host.mjs /path/to/paseo-checkout");
const version = JSON.parse(await readFile(join(resolve(checkout), "packages/server/package.json"), "utf8")).version;
const { register } = await import(pathToFileURL(join(resolve(checkout), "node_modules/tsx/dist/esm/api/index.mjs")).href);
const unregister = register();
const { createTestPaseoDaemon } = await import(pathToFileURL(join(resolve(checkout), "packages/server/src/server/test-utils/paseo-daemon.ts")).href);
const { createTestAgentClient } = await import(pathToFileURL(join(resolve(checkout), "packages/server/src/server/test-utils/fake-agent-client.ts")).href);
const { DaemonClient } = await import(pathToFileURL(join(resolve(checkout), "packages/server/src/server/test-utils/daemon-client.ts")).href);
const root = await mkdtemp(join(tmpdir(), "gongfeng-mcp-host-"));
const originalHome = process.env.PASEO_HOME, originalServerId = process.env.PASEO_SERVER_ID;
process.env.PASEO_HOME = join(root, "host", ".paseo");
delete process.env.PASEO_SERVER_ID;
const launches = [], mcp = new Client({ name: "isolated-gongfeng", version: "1" });
let daemon, host;
const clients = [mcp], agentIds = [];
async function waitFor(predicate) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) { const result = await predicate(); if (result) return result; await new Promise(r => setTimeout(r, 50)); }
  throw new Error("Isolated host verification timed out");
}
try {
  const plugin = join(root, "plugin"); await mkdir(plugin);
  for (const name of ["client", "server", "shared", "assets", "README.md", "OVERVIEW.md", "OVERVIEW.zh-CN.md", "index.client.tsx", "index.server.ts", "paseo-plugin.json", "package.json", "package-lock.json"])
    await cp(resolve(name), join(plugin, name), { recursive: true });
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--registry=https://registry.npmjs.org"], { cwd: plugin, stdio: "ignore", timeout: 120_000 });
  daemon = await createTestPaseoDaemon({ daemonVersion: version, paseoHomeRoot: join(root, "host"), pluginsEnabled: true, mcpEnabled: false,
    agentClients: { codex: createTestAgentClient("codex", { supportsMcpServers: true, beforeCreateSession: async config => { launches.push(config); } }) } });
  // The only upstream boundary is fictional. Refuse an accidental production PASEO_HOME.
  const entry = await readFile(join(plugin, "index.server.ts"), "utf8");
  await writeFile(join(plugin, "index.server.ts"), `
if (process.env.PASEO_HOME !== ${JSON.stringify(daemon.paseoHome)}) throw new Error("Wrong isolated home");
const actualFetch = globalThis.fetch;
globalThis.fetch = async (value, init) => {
 const u = new URL(String(value));
 if (u.origin === "https://gongfeng.example") {
  if (init?.method !== "GET") throw new Error("Remote writes forbidden in acceptance");
  if (u.pathname === "/api/v3/user") return Response.json({id:7,username:"fictional",name:"Fictional"});
  if (u.pathname === "/api/v3/projects/10") return Response.json({id:10,name:"Demo",path_with_namespace:"Demo/Repo"});
  throw new Error("Unexpected fictional API request");
 }
 if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") throw new Error("External requests forbidden");
 return actualFetch(value, init);
};
${entry}`);
  host = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: version });
  await host.connect(); await host.fetchAgents({ subscribe: {} });
  // No Hosted MCP feature flag or registration API is required by this plugin.
  const installed = await host.installDirectoryPlugin(plugin);
  assert.equal(installed.status, "running");
  assert.equal((await host.listPlugins()).find(p => p.id === "gongfeng-workbench").mcpServer, undefined);
  const projectRoot = join(root, "repo"); await mkdir(projectRoot);
  execFileSync("git", ["init", "--quiet", projectRoot]);
  execFileSync("git", ["-C", projectRoot, "remote", "add", "origin", "git@gongfeng.example:Demo/Repo.git"]);
  const workspace = await host.createWorkspace({ source: { kind: "directory", path: projectRoot } });
  const offAgent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id }); agentIds.push(offAgent.id);
  await waitFor(() => launches.length === 1);
  assert.equal(launches[0].mcpServers?.["gongfeng-workbench"], undefined);
  assert((await host.invokePluginRpc("gongfeng-workbench", "connection.save", { siteUrl: "https://gongfeng.example", token: "fictional-isolated-token" })).ok);
  assert((await host.invokePluginRpc("gongfeng-workbench", "repositories.add", { repositoryId: 10 })).ok);
  const settings = await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.read", {});
  assert.equal(settings.values.enabled, false);
  assert.equal((await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.write", { revision: settings.revision, values: { enabled: true } })).status, "saved");
  assert.equal((await host.listPlugins()).find(p => p.id === "gongfeng-workbench").mcpServer, undefined);
  const unboundAgent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id }); agentIds.push(unboundAgent.id);
  await waitFor(() => launches.length === 2);
  assert.equal(launches[1].mcpServers?.["gongfeng-workbench"], undefined);
  assert((await host.invokePluginRpc("gongfeng-workbench", "repositories.bind", { repositoryId: 10, projectId: workspace.workspace.projectId })).ok);
  const agent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id });
  agentIds.push(agent.id);
  await waitFor(() => launches.some(l => l.mcpServers?.["gongfeng-workbench"]));
  const definition = launches.find(l => l.mcpServers?.["gongfeng-workbench"]).mcpServers["gongfeng-workbench"];
  assert.equal(definition.type, "http");
  await mcp.connect(new StreamableHTTPClientTransport(new URL(definition.url), { requestInit: { headers: definition.headers } }));
  const discovered = await mcp.listTools(); assert.equal(discovered.tools.length, 27);
  const rpc = await host.invokePluginRpc("gongfeng-workbench", "repositories.managed", {});
  const called = await mcp.callTool({ name: "list_repositories", arguments: { input: {} } });
  assert.deepEqual(called.structuredContent, { result: rpc }); assert.equal(rpc.items[0].path, "Demo/Repo");
  const binding = await mcp.callTool({ name: "bind_repository", arguments: { confirm: true, input: { projectId: workspace.workspace.projectId, repositoryId: 10 } } });
  assert.equal(binding.isError, undefined);
  const info = await mcp.callTool({ name: "list_repository_bindings", arguments: { input: {} } });
  assert.equal(info.structuredContent.result.bindings[0].projectId, workspace.workspace.projectId);
  const summary = JSON.stringify(await host.listPlugins());
  assert(!summary.includes("fictional-isolated-token")); assert(!summary.includes(definition.headers.authorization));
  await host.invokePluginRpc("gongfeng-workbench", "connection.save", { siteUrl: "https://gongfeng.example", token: "second-fictional-isolated-token" });
  assert.equal(launches.length, 3); // A settings update must not refresh the existing runtime.
  await assert.rejects(mcp.listTools());
  const nextAgent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id }); agentIds.push(nextAgent.id);
  await waitFor(() => launches.length === 4);
  const nextDefinition = launches[3].mcpServers["gongfeng-workbench"];
  assert.notEqual(nextDefinition.url, definition.url);
  assert.notEqual(nextDefinition.headers.authorization, definition.headers.authorization);
  const updatedMcp = new Client({ name: "updated-isolated-gongfeng", version: "1" }); clients.push(updatedMcp);
  await updatedMcp.connect(new StreamableHTTPClientTransport(new URL(nextDefinition.url), { requestInit: { headers: nextDefinition.headers } }));
  assert.deepEqual((await updatedMcp.callTool({ name: "list_repositories", arguments: { input: {} } })).structuredContent, { result: rpc });
  const latest = await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.read", {});
  await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.write", { revision: latest.revision, values: { enabled: false } });
  const disabledAgent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id }); agentIds.push(disabledAgent.id);
  await waitFor(() => launches.length === 5);
  assert.equal(launches[4].mcpServers?.["gongfeng-workbench"], undefined);
  assert.equal(launches[2].mcpServers["gongfeng-workbench"].url, definition.url);
  await assert.rejects(updatedMcp.listTools());
  const off = await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.read", {});
  await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.write", { revision: off.revision, values: { enabled: true } });
  assert.equal((await host.listPlugins()).find(p => p.id === "gongfeng-workbench").mcpServer, undefined);
  await host.disablePlugin("gongfeng-workbench");
  assert(!(await host.listPlugins()).find(p => p.id === "gongfeng-workbench")?.mcpServer);
  await host.enablePlugin("gongfeng-workbench");
  assert.equal((await host.listPlugins()).find(p => p.id === "gongfeng-workbench").mcpServer, undefined);
  const finalAgent = await host.createAgent({ provider: "codex", cwd: projectRoot, workspaceId: workspace.workspace.id }); agentIds.push(finalAgent.id);
  await waitFor(() => launches.length === 6);
  const finalDefinition = launches[5].mcpServers["gongfeng-workbench"];
  const finalMcp = new Client({ name: "uninstall-isolated-gongfeng", version: "1" }); clients.push(finalMcp);
  await finalMcp.connect(new StreamableHTTPClientTransport(new URL(finalDefinition.url), { requestInit: { headers: finalDefinition.headers } }));
  assert.equal((await finalMcp.listTools()).tools.length, 27);
  await host.removePlugin("gongfeng-workbench");
  assert(!(await host.listPlugins()).some(p => p.id === "gongfeng-workbench"));
  await assert.rejects(finalMcp.listTools());
  for (const id of agentIds) await host.archiveAgent(id);
  console.log(JSON.stringify({ isolatedDaemon: version, hostedRegistration: false, defaultOff: true, agentCreateHook: true, projectScoped: true, providerDirectConnection: true, discoveredTools: 27, rpcEqualsMcp: true, localProjectBinding: true, catalogSecretsHidden: true, toggleStopsEndpoint: true, existingConfigPreserved: true, configurationUpdate: true, noRuntimeRefresh: true, disableEnable: true, uninstall: true, modelCalls: 0, remoteWrites: 0 }));
} finally {
  await Promise.all(clients.map(client => client.close().catch(() => {})));
  await host?.close().catch(() => {});
  await daemon?.close();
  if (daemon) await assert.rejects(fetch(`http://127.0.0.1:${daemon.port}/`));
  await rm(root, { recursive: true, force: true }); void unregister();
  if (originalHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = originalHome;
  if (originalServerId === undefined) delete process.env.PASEO_SERVER_ID; else process.env.PASEO_SERVER_ID = originalServerId;
}

// Host test helpers can leave idle retry timers after their sockets and workers close.
process.exit(0);
