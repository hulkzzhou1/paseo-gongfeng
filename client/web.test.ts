import assert from "node:assert/strict";
import { test } from "node:test";
import { containDrawerFocus, widenDescriptionDialog } from "./web.ts";

test("description widens only its own host dialog and restores host sizing", () => {
  const dialog = { style: { width: "", maxWidth: "" } };
  const restore = widenDescriptionDialog({ closest: (selector: string) => selector === '[role="dialog"]' ? dialog : null });
  assert.deepEqual(dialog.style, { width: "calc(100vw - 48px)", maxWidth: "1040px" });
  restore();
  assert.deepEqual(dialog.style, { width: "", maxWidth: "" });
  assert.doesNotThrow(() => widenDescriptionDialog({})());
});

test("drawer wraps keyboard focus, yields to nested dialogs and restores the source row", () => {
  const global = globalThis as unknown as { document?: unknown };
  const previousDocument = global.document;
  let active: object, listener: ((event: ReturnType<typeof key>) => void) | undefined, closed = false;
  const element = () => ({ isConnected: true, focus() { active = this; }, getAttribute() { return null; }, getBoundingClientRect() { return { width: 20, height: 20 }; } });
  const row = element(), first = element(), last = element(), nested = element();
  active = row;
  function key(value: string, shiftKey = false) {
    return { key: value, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  }
  global.document = { get activeElement() { return active; }, addEventListener(_type: string, callback: typeof listener) { listener = callback; }, removeEventListener() { listener = undefined; } };
  try {
    const release = containDrawerFocus({ contains: (node: unknown) => node === first || node === last, querySelectorAll: () => [first, last] }, () => { closed = true; });
    last.focus(); listener!(key("Tab")); assert.equal(active, first);
    first.focus(); listener!(key("Tab", true)); assert.equal(active, last);
    nested.focus(); listener!(key("Escape")); assert.equal(closed, false);
    first.focus(); listener!(key("Escape")); assert.equal(closed, true);
    release(); assert.equal(listener, undefined); assert.equal(active, row);
  } finally { if (previousDocument === undefined) delete global.document; else global.document = previousDocument; }
});
