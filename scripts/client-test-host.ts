import { window } from "./client-test-environment.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { act, createElement, type ReactNode } from "react";
import { JsxEmit, ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { host } from "./client-test-platform.ts";

const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot(container: unknown): { render(children: ReactNode): void; unmount(): void } };

registerHooks({
  resolve(specifier, context, next) {
    if (["react-native", "@getpaseo/plugin/client", "@getpaseo/plugin/client/ui", "@getpaseo/plugin/client/react-native"].includes(specifier)) return { url: new URL("./client-test-platform.ts", import.meta.url).href, shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith(".tsx")) return { format: "module", shortCircuit: true, source: transpileModule(readFileSync(fileURLToPath(url), "utf8"), { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022, jsx: JsxEmit.ReactJSX } }).outputText };
    return next(url, context);
  },
});

const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { WorkbenchBoundary } = await import("../client/draft-guard.tsx");
export const siteUrl = "https://gongfeng.example", accountId = 7;
export const repository = { id: 10, path: "Team/Repo", name: "Repo" };
export const props = { theme: { colors: {} }, layout: { compact: false, platform: "web" }, params: {} } as unknown as import("@getpaseo/plugin/client").PluginScreenProps;

export async function mount(content: ReactNode, invoke: typeof host.invoke) {
  host.invoke = async (name, input) => {
    if (name === "connection.status") return { status: "connected", siteUrl, account: { id: accountId, name: "Test", username: "test" } };
    if (name === "repositories.managed") return { ok: true, items: [repository] };
    return invoke(name, input);
  };
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const container = window.document.createElement("div"); window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(createElement(QueryClientProvider, { client: cache }, createElement(WorkbenchBoundary, { ...props, children: () => content }))); });
  return { cache, container, async close() { await act(async () => root.unmount()); cache.clear(); container.remove(); } };
}
export function button(label: string, container: Pick<typeof window.document, "querySelectorAll"> = window.document) {
  const node = [...container.querySelectorAll("button")].find(button => button.getAttribute("aria-label") === label);
  assert(node, `Missing button: ${label}`); return node;
}
export function input(label: string) {
  const node = [...window.document.querySelectorAll("input")].find(input => input.getAttribute("aria-label") === label);
  assert(node, `Missing input: ${label}`); return node;
}
export async function press(label: string, container?: Parameters<typeof button>[1]) { await act(async () => { button(label, container).click(); }); }
export async function fill(label: string, value: string) {
  await act(async () => { const node = input(label); node.value = value; node.dispatchEvent(new window.Event("input", { bubbles: true })); });
}
export async function until(check: () => void) {
  for (let attempt = 0; ; attempt++) {
    await act(async () => { await delay(10); });
    try { check(); return; } catch (error) { if (attempt >= 49) throw error; }
  }
}
