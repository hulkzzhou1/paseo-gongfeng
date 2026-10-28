// Exercise the installed mainline contract with an isolated daemon and fake providers only.
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const checkout = process.argv[2];
assert(checkout, "Usage: node scripts/verify-agent-tools-host.mjs /path/to/paseo-main");
const base = resolve(checkout), url = path => pathToFileURL(join(base, path)).href;
const version = JSON.parse(await readFile(join(base, "packages/server/package.json"), "utf8")).version;
const { register } = await import(url("node_modules/tsx/dist/esm/api/index.mjs"));
const unregister = register();
const { createTestPaseoDaemon } = await import(url("packages/server/src/server/test-utils/paseo-daemon.ts"));
const { createTestAgentClient } = await import(url("packages/server/src/server/test-utils/fake-agent-client.ts"));
const { DaemonClient } = await import(url("packages/server/src/server/test-utils/daemon-client.ts"));
const { serializePaseoToolInputParameters } = await import(url("packages/server/src/server/agent/tools/paseo-tool-serialization.ts"));
const root = await mkdtemp(join(tmpdir(), "gongfeng-agent-tools-host-"));
const previousHome = process.env.PASEO_HOME, previousId = process.env.PASEO_SERVER_ID;
process.env.PASEO_HOME = join(root, "host", ".paseo"); delete process.env.PASEO_SERVER_ID;
const launches = [], clients = [], agentIds = [];
let daemon, host;
function provider(name, native) {
  const inner = createTestAgentClient(name, { supportsMcpServers: true });
  return { provider: inner.provider, capabilities: { ...inner.capabilities, supportsNativePaseoTools: native },
    async createSession(config, context, options) { launches.push({ config, context, native }); return inner.createSession(config, context, options); },
    async resumeSession(handle, config, context, options) { launches.push({ config, context, native }); return inner.resumeSession(handle, config, context, options); },
    isAvailable: () => inner.isAvailable(),
    fetchCatalog: options => inner.fetchCatalog(options),
  };
}
const names = tools => tools.filter(t => t.name.startsWith("gongfeng_")).map(t => t.name).sort();
async function session(provider, cwd, workspaceId) {
  const agent = await host.createAgent({ provider, cwd, workspaceId }); agentIds.push(agent.id);
  const launch = launches.at(-1); assert(launch); assert.equal(launch.config.mcpServers?.["gongfeng-workbench"], undefined);
  return { agent, launch };
}
async function mcpFor(launch) {
  // This is Paseo's transport, not a plugin listener or saved plugin MCP definition.
  const definition = launch.config.mcpServers?.paseo; assert.equal(definition?.type, "http");
  const client = new Client({ name: "isolated-gongfeng-tools", version: "1" }); clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(definition.url)));
  return client;
}
async function enabled(value) {
  const state = await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.read", {});
  assert.equal((await host.invokePluginRpc("gongfeng-workbench", "settings.mcp.write", { revision: state.revision, values: { enabled: value } })).status, "saved");
}
try {
  const plugin = join(root, "plugin"); await mkdir(plugin);
  for (const name of ["client", "server", "shared", "assets", "README.md", "OVERVIEW.md", "OVERVIEW.zh-CN.md", "index.client.tsx", "index.server.ts", "paseo-plugin.json", "package.json", "package-lock.json"])
    await cp(resolve(name), join(plugin, name), { recursive: true });
  // No node_modules, production dependencies, configured host, or model executable is needed.
  daemon = await createTestPaseoDaemon({ daemonVersion: version, paseoHomeRoot: join(root, "host"), pluginsEnabled: true, mcpEnabled: true,
    agentClients: { codex: provider("codex", false), claude: provider("claude", true) } });
  const entry = await readFile(join(plugin, "index.server.ts"), "utf8");
  await writeFile(join(plugin, "index.server.ts"), `
if (process.env.PASEO_HOME !== ${JSON.stringify(daemon.paseoHome)}) throw new Error("Wrong isolated home");
globalThis.fetch = async (value, init) => {
 const u = new URL(String(value));
 if (u.origin !== "https://gongfeng.example" || init?.method !== "GET") throw new Error("Real requests and remote writes forbidden");
 if (u.pathname === "/api/v3/user") return Response.json({id:7,username:"fictional",name:"Fictional"});
 if (u.pathname === "/api/v3/projects/10") return Response.json({id:10,name:"Demo",path_with_namespace:"Demo/Repo"});
 throw new Error("Unexpected fictional API request");
};
${entry}`);
  host = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: version });
  await host.connect(); await host.fetchAgents({ subscribe: {} });
  assert.equal((await host.installDirectoryPlugin(plugin)).status, "running");
  const projectRoot = join(root, "repo"); await mkdir(projectRoot);
  execFileSync("git", ["init", "--quiet", projectRoot]);
  execFileSync("git", ["-C", projectRoot, "remote", "add", "origin", "git@gongfeng.example:Demo/Repo.git"]);
  const workspace = (await host.createWorkspace({ source: { kind: "directory", path: projectRoot } })).workspace;
  const off = await session("codex", projectRoot, workspace.id), offMcp = await mcpFor(off.launch);
  assert.deepEqual(names((await offMcp.listTools()).tools), []);
  assert((await host.invokePluginRpc("gongfeng-workbench", "connection.save", { siteUrl: "https://gongfeng.example", token: "fictional-isolated-token" })).ok);
  assert((await host.invokePluginRpc("gongfeng-workbench", "repositories.add", { repositoryId: 10 })).ok);
  await enabled(true);
  const unbound = await session("codex", projectRoot, workspace.id), unboundMcp = await mcpFor(unbound.launch);
  assert.deepEqual(names((await unboundMcp.listTools()).tools), []);
  assert((await host.invokePluginRpc("gongfeng-workbench", "repositories.bind", { repositoryId: 10, projectId: workspace.projectId })).ok);
  const attached = await session("codex", projectRoot, workspace.id), mcp = await mcpFor(attached.launch);
  const discovered = (await mcp.listTools()).tools; assert.equal(names(discovered).length, 35);
  const rpc = await host.invokePluginRpc("gongfeng-workbench", "repositories.managed", {});
  assert.deepEqual((await mcp.callTool({ name: "gongfeng_list_repositories", arguments: { input: {} } })).structuredContent, { result: rpc });
  assert.equal((await mcp.callTool({ name: "gongfeng_list_repositories", arguments: { input: { token: "must-not-accept" } } })).isError, true);
  assert.equal((await mcp.callTool({ name: "gongfeng_bind_repository", arguments: { input: { repositoryId: 10, projectId: workspace.projectId } } })).isError, true);
  assert.notEqual((await mcp.callTool({ name: "gongfeng_bind_repository", arguments: { input: { repositoryId: 10, projectId: workspace.projectId }, confirm: true } })).isError, true);
  const native = await session("claude", projectRoot, workspace.id), catalog = native.launch.context.paseoTools;
  const nativeTool = catalog.getTool("gongfeng_list_repositories"); assert(nativeTool);
  assert.deepEqual(serializePaseoToolInputParameters(nativeTool), discovered.find(t => t.name === nativeTool.name).inputSchema);
  assert.deepEqual((await catalog.executeTool(nativeTool.name, { input: {} })).structuredContent, { result: rpc });
  const count = launches.length;
  await enabled(false);
  assert.equal((await mcp.callTool({ name: nativeTool.name, arguments: { input: {} } })).isError, true);
  assert.equal((await catalog.executeTool(nativeTool.name, { input: {} })).isError, true);
  const disabled = await session("codex", projectRoot, workspace.id), disabledMcp = await mcpFor(disabled.launch);
  assert.deepEqual(names((await disabledMcp.listTools()).tools), []);
  assert.equal(launches.length, count + 1); // Settings changes did not reload any Agent.
  await enabled(true);
  const current = await session("codex", projectRoot, workspace.id), currentMcp = await mcpFor(current.launch);
  assert.equal(names((await currentMcp.listTools()).tools).length, 35);
  await host.invokePluginRpc("gongfeng-workbench", "connection.save", { siteUrl: "https://gongfeng.example", token: "rotated-fictional-token" });
  assert.equal((await currentMcp.callTool({ name: nativeTool.name, arguments: { input: {} } })).isError, true);
  const updated = await session("codex", projectRoot, workspace.id), updatedMcp = await mcpFor(updated.launch);
  assert.deepEqual((await updatedMcp.callTool({ name: nativeTool.name, arguments: { input: {} } })).structuredContent, { result: rpc });
  const beforeReload = launches.length;
  await host.reloadPlugin("gongfeng-workbench");
  assert.deepEqual(names((await updatedMcp.listTools()).tools), []); assert.equal(launches.length, beforeReload);
  const reloaded = await session("codex", projectRoot, workspace.id), reloadedMcp = await mcpFor(reloaded.launch);
  assert.equal(names((await reloadedMcp.listTools()).tools).length, 35);
  await host.disablePlugin("gongfeng-workbench"); assert.deepEqual(names((await reloadedMcp.listTools()).tools), []);
  await host.enablePlugin("gongfeng-workbench");
  const final = await session("codex", projectRoot, workspace.id), finalMcp = await mcpFor(final.launch);
  assert.equal(names((await finalMcp.listTools()).tools).length, 35);
  assert(!JSON.stringify([discovered, launches.map(l => l.config), await host.listPlugins()]).includes("fictional-isolated-token"));
  await host.removePlugin("gongfeng-workbench"); assert.deepEqual(names((await finalMcp.listTools()).tools), []);
  for (const id of agentIds) await host.archiveAgent(id);
  console.log(JSON.stringify({ isolatedDaemon: version, tools: 35, rpcEquivalent: true, nativeAndHostTransport: true, projectScoped: true, defaultOff: true, strictInputs: true, writesConfirmed: true, credentialsPrivate: true, toggle: true, credentialRotation: true, reloadDisableUninstall: true, noProactiveRestart: true, pluginHttpListener: false, modelCalls: 0, remoteWrites: 0 }));
} finally {
  await Promise.all(clients.map(c => c.close().catch(() => {}))); await host?.close().catch(() => {}); await daemon?.close();
  await rm(root, { recursive: true, force: true }); void unregister();
  if (previousHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previousHome;
  if (previousId === undefined) delete process.env.PASEO_SERVER_ID; else process.env.PASEO_SERVER_ID = previousId;
}
// Host helpers can leave idle timers after their isolated workers and sockets have closed.
process.exit(0);
