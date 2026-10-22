import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { ZodType } from "zod";
import contribute from "../index.server.ts";
import { saveConnection } from "../shared/connection.ts";
import { boardPage } from "../shared/board.ts";
import { bindRepository, unbindRepository } from "../shared/repositories.ts";

type Contract<T> = { name: string; input: ZodType; output: ZodType<T> };
let home: string;
let previousHome: string | undefined;
let cleanup: ReturnType<typeof contribute>;
let handlers: Map<string, (input: unknown) => unknown>;
const account = { id: 7, username: "alice", name: "Alice" };
const project = { id: 10, path_with_namespace: "Team/Sub/Repo", web_url: "https://git.woa.com/Team/Sub/Repo" };

test("看板请求和MR链接跟随自定义站点，旧页面即使账号ID相同也拒绝查询", async () => {
  await connect(url => {
    assert.equal(url.origin, "https://code.example");
    return Response.json([{ project, merge_requests: [mr] }]);
  });
  await rpc(saveConnection, { siteUrl: "https://code.example", token: "other-token" });
  const result = await rpc(boardPage, { relation: "authored", state: "all", page: 1, siteUrl: "https://code.example" });
  assert(result.ok); assert.equal(result.items[0].url, "https://code.example/Team/Sub/Repo/merge_requests/2");
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1, accountId: 7, siteUrl: "https://git.woa.com" }), { ok: false, error: "account_changed" });
});
const mr = { id: 100, iid: 2, title: "A change", state: "opened" };

test("全部可见MR不传作者或评审人限制，保留其他作者和项目", async () => {
  await connect(url => {
    assert.equal(url.searchParams.has("author_user_name"), false);
    assert.equal(url.searchParams.has("reviewer_user_name"), false);
    return Response.json([{ project, merge_requests: [{ ...mr, author: { username: "bob" } }] }, { project: { ...project, id: 20 }, merge_requests: [{ ...mr, id: 101, author: { username: "charlie" } }] }]);
  });
  const result = await rpc(boardPage, { relation: "all", state: "all", page: 1, accountId: 7 });
  assert(result.ok); assert.deepEqual(result.items.map(m => [m.projectId, m.authorUsername]), [[10, "bob"], [20, "charlie"]]);
});

test("关键词按服务端原始分页扫描，空匹配页仍可在后页查到，不能依赖上游忽略的search参数", async () => {
  await connect(url => {
    assert.equal(url.searchParams.get("per_page"), "100"); assert.equal(url.searchParams.has("search"), false);
    const page = Number(url.searchParams.get("page"));
    return Response.json([{ project, merge_requests: page === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...mr, id: 100 + i, title: "Other change" })) : [{ ...mr, title: "Fix Kubernetes", author: { username: "bob" } }] }]);
  });
  const first = await rpc(boardPage, { relation: "all", state: "opened", page: 1, search: " kubernetes " });
  assert(first.ok); assert.equal(first.items.length, 0); assert.equal(first.scanned, 100); assert.equal(first.nextPage, 2);
  const second = await rpc(boardPage, { relation: "all", state: "opened", page: first.nextPage, search: "KUBERNETES" });
  assert(second.ok); assert.equal(second.items.length, 1); assert.equal(second.scanned, 1); assert.equal(second.nextPage, null);
});

test("搜索支持仓库路径、编号及作者，并与关系和状态独立组合，拒绝超长输入", async () => {
  await connect(url => {
    assert.equal(url.searchParams.get("author_user_name"), "alice"); assert.equal(url.searchParams.get("state"), "merged");
    return Response.json([{ project, merge_requests: [{ ...mr, state: "merged", author: { username: "bob" } }] }], { headers: { "X-Next-Page": "" } });
  });
  for (const search of ["team/sub", "!2", "@bob"]) {
    const result = await rpc(boardPage, { relation: "authored", state: "merged", page: 1, search }); assert(result.ok); assert.equal(result.items.length, 1);
  }
  await assert.rejects(rpc(boardPage, { relation: "all", state: "all", page: 1, search: "x".repeat(257) }));
});
async function rpc<T>(contract: Contract<T>, input: unknown) {
  const handler = handlers.get(contract.name);
  assert(handler, `Missing RPC: ${contract.name}`);
  return contract.output.parse(await handler(contract.input.parse(input)));
}
beforeEach(async () => {
  previousHome = process.env.PASEO_HOME;
  home = await mkdtemp(join(tmpdir(), "gongfeng-board-"));
  process.env.PASEO_HOME = home;
  await writeFile(join(home, "server-id"), "board-test-daemon");
  handlers = new Map();
  cleanup = contribute({ handle(contract, handler) {
    handlers.set(contract.name, (input) => handler(contract.input.parse(input), { paseo: { projects: { list: async () => ({ projects: ["local-a", "local-b"].map(projectId => ({ projectId, projectDisplayName: projectId, projectRootPath: home })) }) } } } as never));
  } } as PluginServerContext);
});
afterEach(async () => {
  cleanup(); mock.restoreAll();
  if (previousHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previousHome;
  await rm(home, { recursive: true, force: true });
});
async function connect(response: (url: URL) => Response | Promise<Response>) {
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error");
    const parsed = new URL(String(url));
    return parsed.pathname === "/api/v3/user" ? Response.json(account) : response(parsed);
  });
  await rpc(saveConnection, { token: "test-token" });
}
test("按当前账号查作者分组，保留MR身份并去重，不能把未配置伪装为空", async () => {
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), { ok: false, error: "unconfigured" });
  await connect((url) => {
    assert.equal(url.pathname, "/api/v3/dashboard/merge_requests");
    assert.equal(url.searchParams.get("author_user_name"), "alice");
    assert.equal(url.searchParams.get("reviewer_user_name"), null);
    assert.equal(url.searchParams.get("state"), "all");
    return Response.json([{ project, merge_requests: [mr, mr] }]);
  });
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), {
    ok: true, accountId: 7, items: [{ projectId: 10, projectPath: "Team/Sub/Repo", ...mr, authorUsername: null, url: "https://git.woa.com/Team/Sub/Repo/merge_requests/2" }], nextPage: null, scanned: 2,
  });
});

test("MR所有者显示作者英文账号，缺失时不冒用当前评审人或显示名", async () => {
  await connect(() => Response.json([{ project, merge_requests: [
    { ...mr, author: { username: "bob", name: "中文显示名" } },
    { ...mr, id: 101, author: null },
    { ...mr, id: 102, author: { name: "只有显示名" } },
  ] }]));
  const result = boardPage.output.parse(await rpc(boardPage, { relation: "reviewing", state: "all", page: 1 }));
  assert(result.ok);
  assert.deepEqual(result.items.map(item => item.authorUsername), ["bob", null, null]);
});

test("开放使用all分页包含reopened和未知状态，评审关系独立且只承诺已扫描页", async () => {
  await connect((url) => {
    assert.equal(url.searchParams.get("reviewer_user_name"), "alice");
    assert.equal(url.searchParams.get("author_user_name"), null);
    assert.equal(url.searchParams.get("state"), "all");
    return Response.json([{ project, merge_requests: [mr, { ...mr, id: 101, state: "reopened" }, { ...mr, id: 102, state: "locked" }, { ...mr, id: 103, state: "merged" }] }], { headers: { "X-Next-Page": "2" } });
  });
  const result = boardPage.output.parse(await rpc(boardPage, { relation: "reviewing", state: "opened", page: 1 }));
  assert(result.ok);
  assert.equal(result.nextPage, 2); assert.equal(result.scanned, 4);
  assert.deepEqual(result.items.map((item: { state: string }) => item.state), ["opened", "reopened", "locked"]);
});

test("账号切换后拒绝继续加载旧身份的页", async () => {
  let requests = 0;
  await connect(() => { requests++; return Response.json([]); });
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 2, accountId: 99 }), { ok: false, error: "account_changed" });
  assert.equal(requests, 0);
});

test("分页按MR数量而非项目分组，历史状态透传，末页明确结束", async () => {
  await connect((url) => {
    assert.equal(url.searchParams.get("state"), "merged");
    const page = Number(url.searchParams.get("page"));
    return Response.json([{ project, merge_requests: page === 1 ? Array.from({ length: 20 }, (_, i) => ({ ...mr, id: i + 100, iid: i + 2, state: "merged" })) : [] }]);
  });
  const first = boardPage.output.parse(await rpc(boardPage, { relation: "authored", state: "merged", page: 1 }));
  assert(first.ok); assert.equal(first.items.length, 20); assert.equal(first.nextPage, 2);
  const second = boardPage.output.parse(await rpc(boardPage, { relation: "authored", state: "merged", page: 2, accountId: first.accountId }));
  assert(second.ok); assert.equal(second.items.length, 0); assert.equal(second.nextPage, null);
});
test("看板暂时性服务失败后重试并返回同一请求的数据", async () => {
  let calls = 0;
  await connect(() => ++calls === 1 ? new Response(null, { status: 503 }) : Response.json([{ project, merge_requests: [mr] }]));
  const result = await rpc(boardPage, { relation: "authored", state: "all", page: 1 });
  assert(result.ok); assert.equal(result.items[0].id, mr.id); assert.equal(calls, 2);
});

for (const [status, error] of [[401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [429, "rate_limited"], [500, "service_error"]] as const) {
  test(`看板HTTP ${status}明确报错，暂时性错误重试有界且不返回原文`, async () => {
    let calls = 0;
    await connect(() => { calls++; return new Response("private remote text", { status }); });
    assert.deepEqual(await rpc(boardPage, { relation: "reviewing", state: "closed", page: 1 }), { ok: false, error });
    assert.equal(calls, status === 429 || status >= 500 ? 3 : 1);
  });
}
test("非法结构、非JSON和网络错误均不伪装为空数据，另一关系仍可独立成功", async () => {
  let response: () => Response = () => new Response("<html>private</html>");
  await connect((url) => url.searchParams.has("author_user_name") ? Response.json([]) : response());
  for (const bad of [() => new Response("<html>private</html>"), () => Response.json({ items: [] }), () => Response.json([{ project, merge_requests: [{ ...mr, id: "not-an-id" }] }])]) {
    response = bad;
    assert.deepEqual(await rpc(boardPage, { relation: "reviewing", state: "all", page: 1 }), { ok: false, error: "invalid_response" });
  }
  response = () => { throw new Error("secret detail"); };
  assert.deepEqual(await rpc(boardPage, { relation: "reviewing", state: "all", page: 1 }), { ok: false, error: "network_error" });
  const other = boardPage.output.parse(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }));
  assert(other.ok); assert.deepEqual(other.items, []);
});
test("坏分页头不会造成循环加载，空X-Next-Page表示末页", async () => {
  let next = "1";
  await connect(() => Response.json([{ project, merge_requests: [mr] }], { headers: { "X-Next-Page": next } }));
  for (const bad of ["1", "0", "bad", "-1", "10001"]) {
    next = bad;
    assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), { ok: false, error: "invalid_response" });
  }
  next = "";
  const last = boardPage.output.parse(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }));
  assert(last.ok); assert.equal(last.nextPage, null);
});


test("无关联仍可全局发现，不能把任意仓库当作关联筛选", async () => {
  await connect(url => url.pathname === "/api/v3/projects/10" ? Response.json({ ...project, name: "Repo" }) : Response.json([{ project, merge_requests: [mr] }]));
  const global = await rpc(boardPage, { relation: "authored", state: "all", page: 1 });
  assert(global.ok); assert.deepEqual(global.items.map(item => item.projectId), [10]);
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1, repositoryId: 10 }), { ok: false, error: "stale_binding" });
});


test("同仓库多个项目只筛选一份MR，空筛选页仍保留后页与全局发现", async () => {
  await connect(url => {
    if (url.pathname === "/api/v3/projects/10") return Response.json({ ...project, name: "Repo" });
    const page = Number(url.searchParams.get("page"));
    return Response.json(page === 1 ? [{ project: { ...project, id: 20 }, merge_requests: [mr] }]
      : [{ project, merge_requests: [mr, mr] }, { project: { ...project, id: 20 }, merge_requests: [mr] }], { headers: { "X-Next-Page": page === 1 ? "2" : "" } });
  });
  for (const projectId of ["local-a", "local-b"]) assert.equal((await rpc(bindRepository, { repositoryId: 10, projectId })).ok, true);
  const input = { relation: "authored", state: "all", accountId: 7, repositoryId: 10 };
  const first = await rpc(boardPage, { ...input, page: 1 });
  assert(first.ok); assert.deepEqual(first.items, []); assert.equal(first.nextPage, 2); assert.equal(first.scanned, 1);
  const second = await rpc(boardPage, { ...input, page: 2 });
  assert(second.ok); assert.deepEqual(second.items.map(item => item.projectId), [10]); assert.equal(second.nextPage, null); assert.equal(second.scanned, 3);
  const global = await rpc(boardPage, { relation: "authored", state: "all", accountId: 7, page: 1 });
  assert(global.ok); assert.deepEqual(global.items.map(item => item.projectId), [20]); assert.equal(global.nextPage, 2);
});


test("解除最后关联后旧分页明确失效，保留另一关联时仍可筛选，账号与状态切换不继承过滤页", async () => {
  await connect(url => {
    if (url.pathname === "/api/v3/projects/10") return Response.json({ ...project, name: "Repo" });
    const state = url.searchParams.get("state");
    return Response.json([{ project, merge_requests: [{ ...mr, state: state === "merged" ? "merged" : "opened" }] }], { headers: { "X-Next-Page": "" } });
  });
  for (const projectId of ["local-a", "local-b"]) await rpc(bindRepository, { repositoryId: 10, projectId });
  const input = { relation: "reviewing", state: "opened", accountId: 7, repositoryId: 10, page: 1 };
  assert.equal((await rpc(boardPage, input)).ok, true);
  await rpc(unbindRepository, { repositoryId: 10, projectId: "local-a" });
  assert.equal((await rpc(boardPage, input)).ok, true);
  assert.deepEqual(await rpc(boardPage, { ...input, accountId: 99, page: 2 }), { ok: false, error: "account_changed" });
  const merged = await rpc(boardPage, { ...input, state: "merged" });
  assert(merged.ok); assert.deepEqual(merged.items.map(item => item.state), ["merged"]);
  await rpc(unbindRepository, { repositoryId: 10, projectId: "local-b" });
  assert.deepEqual(await rpc(boardPage, { ...input, page: 2 }), { ok: false, error: "stale_binding" });
  const global = await rpc(boardPage, { relation: "reviewing", state: "all", accountId: 7, page: 1 });
  assert(global.ok); assert.deepEqual(global.items.map(item => item.projectId), [10]);
});


test("成功更换账号后拒绝旧筛选分页，新账号从第一页查询自身结果", async () => {
  let current = account;
  mock.method(globalThis, "fetch", async (value: string | URL | Request) => {
    const url = new URL(String(value));
    if (url.pathname === "/api/v3/user") return Response.json(current);
    if (url.pathname === "/api/v3/projects/10") return Response.json({ ...project, name: "Repo" });
    assert.equal(url.searchParams.get("author_user_name"), current.username);
    return Response.json([{ project, merge_requests: [{ ...mr, id: current.id === 7 ? 100 : 200 }] }], { headers: { "X-Next-Page": "2" } });
  });
  await rpc(saveConnection, { token: "first-test-token" });
  await rpc(bindRepository, { repositoryId: 10, projectId: "local-a" });
  const input = { relation: "authored", state: "all", repositoryId: 10, accountId: 7, page: 1 };
  const first = await rpc(boardPage, input); assert(first.ok); assert.equal(first.items[0].id, 100);
  current = { id: 8, username: "bob", name: "Bob" };
  await rpc(saveConnection, { token: "second-test-token" });
  assert.deepEqual(await rpc(boardPage, { ...input, page: 2 }), { ok: false, error: "account_changed" });
  const switched = await rpc(boardPage, { ...input, accountId: 8 });
  assert(switched.ok); assert.deepEqual(switched.items.map(item => item.id), [200]);
});

for (const kind of ["network", "rate_limit"] as const) {
  test(`看板 ${kind} 暂时失败两次后仍可恢复`, async () => {
    let calls = 0;
    await connect(() => {
      if (++calls < 3) {
        if (kind === "network") throw new TypeError("private network failure");
        return new Response(null, { status: 429 });
      }
      return Response.json([{ project, merge_requests: [mr] }]);
    });
    const result = await rpc(boardPage, { relation: "reviewing", state: "all", page: 1 });
    assert(result.ok); assert.equal(result.items[0].id, mr.id); assert.equal(calls, 3);
  });
}

test("Retry-After 秒数等待完成后才能重新请求", async () => {
  const times: number[] = [];
  await connect(() => {
    times.push(Date.now());
    return times.length === 1 ? new Response(null, { status: 429, headers: { "Retry-After": "1" } }) : Response.json([]);
  });
  const result = await rpc(boardPage, { relation: "authored", state: "all", page: 1 });
  assert(result.ok); assert.equal(times.length, 2); assert(times[1] - times[0] >= 1000);
});

for (const retryAfter of ["60", new Date(Date.now() + 60_000).toUTCString()]) {
  test(`Retry-After 超过总时限时直接返回限流，不提前请求 (${retryAfter})`, async () => {
    let calls = 0;
    await connect(() => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": retryAfter } }); });
    const start = Date.now();
    assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), { ok: false, error: "rate_limited" });
    assert.equal(calls, 1); assert(Date.now() - start < 1000);
  });
}

test("卸载插件终止退避等待，不再发出请求", async () => {
  let calls = 0;
  let attempted!: () => void;
  const first = new Promise<void>(resolve => { attempted = resolve; });
  await connect(() => { calls++; attempted(); return new Response(null, { status: 503 }); });
  const pending = rpc(boardPage, { relation: "authored", state: "all", page: 1 });
  await first; await new Promise(resolve => setImmediate(resolve));
  cleanup();
  assert.deepEqual(await pending, { ok: false, error: "network_error" });
  await new Promise(resolve => setTimeout(resolve, 300)); assert.equal(calls, 1);
});

test("非法 JSON、结构、参数与权限响应均不自动重试", async () => {
  let calls = 0;
  let response: () => Response = () => new Response("not json");
  await connect(() => { calls++; return response(); });
  for (const [next, error] of [
    [() => new Response("not json"), "invalid_response"],
    [() => Response.json({ items: [] }), "invalid_response"],
    [() => new Response(null, { status: 400 }), "service_error"],
    [() => new Response(null, { status: 401 }), "unauthorized"],
    [() => new Response(null, { status: 403 }), "forbidden"],
  ] as const) {
    calls = 0; response = next;
    assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), { ok: false, error });
    assert.equal(calls, 1);
  }
});

test("整个 GET 含退避与响应传输受同一个十秒时限约束", { timeout: 12_000 }, async () => {
  await connect(() => Response.json([]));
  let calls = 0; let activeSignal: AbortSignal | null | undefined;
  mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/user")) return Response.json(account);
    if (++calls === 1) return new Response(null, { status: 503 });
    activeSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => activeSignal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  const start = Date.now();
  assert.deepEqual(await rpc(boardPage, { relation: "authored", state: "all", page: 1 }), { ok: false, error: "network_error" });
  assert.equal(calls, 2); assert.equal(activeSignal?.aborted, true);
  assert(Date.now() - start >= 9900); assert(Date.now() - start < 11_000);
});

test("全部选择仓库时直接查询该项目，首屏不能被其他项目的全局分页挤空", async () => {
  await connect(url => {
    if (url.pathname === "/api/v3/projects/10") return Response.json({ ...project, name: "Repo" });
    if (url.pathname === "/api/v3/projects/10/merge_requests") {
      assert.equal(url.searchParams.has("author_id"), false);
      assert.equal(url.searchParams.has("reviewer_id"), false);
      assert.equal(url.searchParams.has("state"), false);
      assert.equal(url.searchParams.get("order_by"), "updated_at");
      return Response.json([{ ...mr, author: { username: "bob" } }, { ...mr, id: 101, state: "reopened" }, { ...mr, id: 102, state: "merged" }], { headers: { "X-Next-Page": "" } });
    }
    return Response.json([{ project: { ...project, id: 20 }, merge_requests: Array.from({ length: 20 }, (_, i) => ({ ...mr, id: 200 + i })) }]);
  });
  for (const projectId of ["local-a", "local-b"]) await rpc(bindRepository, { repositoryId: 10, projectId });
  const result = await rpc(boardPage, { relation: "all", state: "opened", page: 1, repositoryId: 10 });
  assert(result.ok); assert.deepEqual(result.items.map(p => [p.projectId, p.id]), [[10, 100], [10, 101]]); assert.equal(result.scanned, 3); assert.equal(result.nextPage, null);
});

test("项目全部查询保留状态、关键词与原始分页，非法结构仍报错", async () => {
  let malformed = false;
  await connect(url => {
    if (url.pathname === "/api/v3/projects/10") return Response.json({ ...project, name: "Repo" });
    assert.equal(url.pathname, "/api/v3/projects/10/merge_requests");
    assert.equal(url.searchParams.get("state"), "merged");
    assert.equal(url.searchParams.get("per_page"), "100");
    assert.equal(url.searchParams.has("search"), false);
    const page = Number(url.searchParams.get("page"));
    return Response.json(malformed ? [{ ...mr, id: "invalid" }] : [{ ...mr, state: "merged", title: page === 1 ? "Other" : "Wanted", author: { username: "bob" } }], { headers: { "X-Next-Page": page === 1 ? "2" : "" } });
  });
  await rpc(bindRepository, { repositoryId: 10, projectId: "local-a" });
  const input = { relation: "all", state: "merged", repositoryId: 10, search: "wanted" };
  const first = await rpc(boardPage, { ...input, page: 1 }); assert(first.ok); assert.equal(first.items.length, 0); assert.equal(first.nextPage, 2);
  const second = await rpc(boardPage, { ...input, page: 2 }); assert(second.ok); assert.equal(second.items[0].title, "Wanted"); assert.equal(second.nextPage, null);
  malformed = true;
  assert.deepEqual(await rpc(boardPage, { ...input, page: 1 }), { ok: false, error: "invalid_response" });
});
