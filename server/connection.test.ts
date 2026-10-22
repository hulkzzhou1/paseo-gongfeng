import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { chmod, mkdtemp, mkdir, readFile, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { createGongfengClient } from "./gongfeng.ts";
import { connectionStatus, saveConnection } from "../shared/connection.ts";

let home: string;
let previousHome: string | undefined;
let cleanup: ReturnType<typeof contribute>;
let handlers: Map<string, (input: unknown) => unknown>;

function start() {
  handlers = new Map();
  cleanup = contribute({
    handle(contract, handler) {
      handlers.set(contract.name, (input) => handler(contract.input.parse(input), {} as never));
    },
  } as PluginServerContext);
}

async function rpc<T>(contract: { name: string; input: ZodType; output: ZodType<T> }, input: unknown = {}) {
  const handler = handlers.get(contract.name);
  assert(handler, `Missing RPC: ${contract.name}`);
  return contract.output.parse(await handler(contract.input.parse(input)));
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "gongfeng-test-"));
  previousHome = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  start();
});

afterEach(async () => {
  await cleanup?.();
  mock.restoreAll();
  if (previousHome === undefined) delete process.env.PASEO_HOME;
  else process.env.PASEO_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
});

test("未配置账号时不发起工蜂请求", async () => {
  const request = mock.method(globalThis, "fetch", async () => {
    throw new Error("不应请求远程服务");
  });
  assert.deepEqual(await rpc(connectionStatus), { status: "unconfigured" });
  assert.equal(request.mock.callCount(), 0);
});

test("验证并保存后，仅返回账号且重载后仍能验证连接", async () => {
  const token = "test-only-token-alice";
  const account = { id: 7, username: "alice", name: "Alice" };
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, "https://git.woa.com/api/v3/user");
    assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("PRIVATE-TOKEN"), token);
    assert.equal(init?.redirect, "error");
    assert(init?.signal);
    return Response.json({ ...account, private_token: token, email: "private@example.invalid" });
  });
  assert.deepEqual(await rpc(saveConnection, { token }), { ok: true, account, siteUrl: "https://git.woa.com" });
  await cleanup();
  start();
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account, siteUrl: "https://git.woa.com" });
});

test("秘密存储只允许当前用户访问，目录权限被放宽时拒绝使用", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ id: 7, username: "alice", name: "Alice" }));
  await rpc(saveConnection, { token: "test-only-token" });
  const directory = join(home, "secrets", "gongfeng-workbench");
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(join(directory, "private-token"))).mode & 0o777, 0o600);
  await chmod(directory, 0o755);
  assert.deepEqual(await rpc(connectionStatus), { status: "error", error: "storage_error" });
});

test("无效新凭据不会覆盖可用账号，HTTP 错误不回显上游内容", async () => {
  const account = { id: 7, username: "alice", name: "Alice" };
  mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("PRIVATE-TOKEN");
    return token === "test-alice" ? Response.json(account) : new Response(String(token), { status: 401 });
  });
  await rpc(saveConnection, { token: "test-alice" });
  assert.deepEqual(await rpc(saveConnection, { token: "rejected-test-secret" }), { ok: false, error: "unauthorized" });
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account, siteUrl: "https://git.woa.com" });
});

test("更换成功后所有状态查询使用新账号，不保留旧账号缓存", async () => {
  mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    const alice = new Headers(init?.headers).get("PRIVATE-TOKEN") === "test-alice";
    return Response.json(alice ? { id: 7, username: "alice", name: "Alice" } : { id: 8, username: "bob", name: "Bob" });
  });
  await rpc(saveConnection, { token: "test-alice" });
  assert.deepEqual(await rpc(saveConnection, { token: "test-bob" }), { ok: true, account: { id: 8, username: "bob", name: "Bob" }, siteUrl: "https://git.woa.com" });
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account: { id: 8, username: "bob", name: "Bob" }, siteUrl: "https://git.woa.com" });
});

test("保存失败保留原凭据，并允许修复存储后重试", async () => {
  const account = { id: 7, username: "alice", name: "Alice" };
  mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    return Response.json(new Headers(init?.headers).get("PRIVATE-TOKEN") === "test-alice"
      ? account : { id: 8, username: "bob", name: "Bob" });
  });
  await rpc(saveConnection, { token: "test-alice" });
  const directory = join(home, "secrets", "gongfeng-workbench");
  const original = join(home, "saved-credentials");
  await rename(directory, original);
  await writeFile(directory, "模拟不可写目标");
  assert.deepEqual(await rpc(saveConnection, { token: "test-bob" }), { ok: false, error: "storage_error" });
  await rm(directory);
  await rename(original, directory);
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account, siteUrl: "https://git.woa.com" });
  assert.deepEqual(await rpc(saveConnection, { token: "test-bob" }), { ok: true, account: { id: 8, username: "bob", name: "Bob" }, siteUrl: "https://git.woa.com" });
});

for (const [httpStatus, error] of [[401, "unauthorized"], [403, "forbidden"], [404, "service_error"], [429, "service_error"], [500, "service_error"]] as const) {
  test(`HTTP ${httpStatus} 返回明确错误而非空账号`, async () => {
    mock.method(globalThis, "fetch", async () => new Response("upstream-test-secret", { status: httpStatus }));
    assert.deepEqual(await rpc(saveConnection, { token: "test-only-token" }), { ok: false, error });
    assert.deepEqual(await rpc(connectionStatus), { status: "unconfigured" });
  });
}

test("网络异常和响应格式错误分别处理，原始异常不会泄露", async () => {
  const request = mock.method(globalThis, "fetch", async (): Promise<Response> => { throw new Error("test-secret-in-network-error"); });
  assert.deepEqual(await rpc(saveConnection, { token: "test-only-token" }), { ok: false, error: "network_error" });
  request.mock.mockImplementation(async () => new Response("not-json-test-secret"));
  assert.deepEqual(await rpc(saveConnection, { token: "test-only-token" }), { ok: false, error: "invalid_response" });
  request.mock.mockImplementation(async () => Response.json({ id: "not-an-id", username: "alice", name: "Alice" }));
  assert.deepEqual(await rpc(saveConnection, { token: "test-only-token" }), { ok: false, error: "invalid_response" });
});

test("已保存令牌失效时显示失效，保留凭据并可重新验证", async () => {
  const account = { id: 7, username: "alice", name: "Alice" };
  const request = mock.method(globalThis, "fetch", async () => Response.json(account));
  await rpc(saveConnection, { token: "test-only-token" });
  request.mock.mockImplementation(async () => new Response(null, { status: 401 }));
  assert.deepEqual(await rpc(connectionStatus), { status: "error", error: "unauthorized", siteUrl: "https://git.woa.com" });
  request.mock.mockImplementation(async () => Response.json(account));
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account, siteUrl: "https://git.woa.com" });
});

test("响应体传输中断返回网络错误且保留原账号", async () => {
  const account = { id: 7, username: "alice", name: "Alice" };
  const request = mock.method(globalThis, "fetch", async () => Response.json(account));
  await rpc(saveConnection, { token: "test-alice" });
  request.mock.mockImplementation(async () => {
    const response = new Response();
    mock.method(response, "text", async () => { throw new TypeError("test-secret-in-stream-error"); });
    return response;
  });
  assert.deepEqual(await rpc(saveConnection, { token: "test-bob" }), { ok: false, error: "network_error" });
  request.mock.mockImplementation(async () => Response.json(account));
  assert.deepEqual(await rpc(connectionStatus), { status: "connected", account, siteUrl: "https://git.woa.com" });
});

test("拒绝空白、超长、带换行的凭据及任意 URL 输入", async () => {
  const request = mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const token of ["", "   ", "a".repeat(4097), "test\nsecret"]) {
    await assert.rejects(rpc(saveConnection, { token }));
  }
  await assert.rejects(rpc(saveConnection, { token: "test-only-token", url: "https://untrusted.invalid" }));
  assert.equal(request.mock.callCount(), 0);
});

test("损坏或被替换为符号链接的凭据不会用于远程请求", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ id: 7, username: "alice", name: "Alice" }));
  await rpc(saveConnection, { token: "test-only-token" });
  const credential = join(home, "secrets", "gongfeng-workbench", "private-token");
  await writeFile(credential, "a".repeat(4097));
  assert.deepEqual(await rpc(connectionStatus), { status: "error", error: "storage_error" });
  await rm(credential);
  const outside = join(home, "outside-secret");
  await writeFile(outside, "unrelated-test-secret", { mode: 0o600 });
  await symlink(outside, credential);
  assert.deepEqual(await rpc(connectionStatus), { status: "error", error: "storage_error" });
});

test("自定义站点规范化且逐站点保存凭据，切换不向新站点发送旧Token", async () => {
  const sent: [string, string | null][] = [];
  mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    sent.push([String(url), new Headers(init?.headers).get("PRIVATE-TOKEN")]);
    assert.equal(init?.redirect, "error");
    return Response.json({ id: 7, username: "alice", name: "Alice" });
  });
  await rpc(saveConnection, { siteUrl: "https://FIRST.example/", token: "first-token" });
  assert.deepEqual(await rpc(saveConnection, { siteUrl: "https://second.example" }), { ok: false, error: "unauthorized" });
  assert.equal(sent.length, 1);
  await rpc(saveConnection, { siteUrl: "https://second.example:8443/", token: "second-token" });
  await cleanup(); start();
  const status = await rpc(connectionStatus);
  assert(status.status === "connected");
  assert.equal(status.siteUrl, "https://second.example:8443");
  await rpc(saveConnection, { siteUrl: "https://first.example" });
  assert.deepEqual(sent, [
    ["https://first.example/api/v3/user", "first-token"],
    ["https://second.example:8443/api/v3/user", "second-token"],
    ["https://second.example:8443/api/v3/user", "second-token"],
    ["https://first.example/api/v3/user", "first-token"],
  ]);
  assert(!JSON.stringify(status).includes("token"));
});

test("旧纯Token配置只属于原站点，首次保存迁移且新站点验证失败保留旧配置", async () => {
  const directory = join(home, "secrets/gongfeng-workbench");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, "private-token"), "legacy-token", { mode: 0o600 });
  const account = { id: 7, username: "alice", name: "Alice" };
  mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
    const destination = String(url);
    if (destination.startsWith("https://new.example/")) {
      assert.equal(new Headers(init?.headers).get("PRIVATE-TOKEN"), "new-token");
      return new Response("private-upstream", { status: 401 });
    }
    assert.equal(new Headers(init?.headers).get("PRIVATE-TOKEN"), "legacy-token");
    return Response.json(account);
  });
  const legacy = await rpc(connectionStatus); assert(legacy.status === "connected");
  assert.equal(legacy.siteUrl, "https://git.woa.com");
  assert.equal((await rpc(saveConnection, { siteUrl: "https://new.example", token: "new-token" })).ok, false);
  assert.equal(await readFile(join(directory, "private-token"), "utf8"), "legacy-token");
  await rpc(saveConnection, { siteUrl: "https://git.woa.com" });
  const saved = JSON.parse(await readFile(join(directory, "private-token"), "utf8"));
  assert.equal(saved.activeSite, "https://git.woa.com");
  assert.deepEqual(saved.sites, [{ siteUrl: "https://git.woa.com", token: "legacy-token" }]);
});

test("站点地址拒绝HTTP、凭据、路径、查询、片段和内嵌空白，不发网络请求", async () => {
  const request = mock.method(globalThis, "fetch", async () => Response.json({}));
  for (const siteUrl of ["", "http://code.example", "https://user:secret@code.example", "https://code.example/api/v3", "https://code.example?token=x", "https://code.example#part", "https://co\nde.example", "https://code.example\\path"]) {
    await assert.rejects(rpc(saveConnection, { siteUrl, token: "test-token" }));
  }
  assert.equal(request.mock.callCount(), 0);
});

test("切换配置等待本地写操作结束，进行中的操作保持原站点", async () => {
  mock.method(globalThis, "fetch", async () => Response.json({ id: 7, username: "alice", name: "Alice" }));
  const api = createGongfengClient();
  try {
    await api.save("first-token", "https://first.example");
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const operation = api.exclusive(async () => {
      entered(); await gate;
      assert.equal(await api.siteUrl(), "https://first.example");
    });
    await started;
    const switching = api.save("second-token", "https://second.example");
    assert.equal(await api.siteUrl(), "https://first.example");
    release(); await operation;
    assert((await switching).ok);
    assert.equal(await api.siteUrl(), "https://second.example");
  } finally { api.dispose(); }
});
