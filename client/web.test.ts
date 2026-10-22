import assert from "node:assert/strict";
import { test } from "node:test";
import { containDrawerFocus, widenDescriptionDialog, sizeReviewerDialog } from "./web.ts";

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
  let active: object, listener: ((event: ReturnType<typeof key>) => void) | undefined, closed = false, captureKeys = false;
  const element = () => ({ isConnected: true, focus() { active = this; }, getAttribute() { return null; }, getBoundingClientRect() { return { width: 20, height: 20 }; } });
  const row = element(), first = element(), last = element(), nested = element();
  active = row;
  function key(value: string, shiftKey = false, isComposing = false) {
    return { key: value, shiftKey, isComposing, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  }
  global.document = { get activeElement() { return active; }, addEventListener(_type: string, callback: typeof listener, capture?: boolean) { listener = callback; captureKeys = !!capture; }, removeEventListener(_type: string, callback: typeof listener, capture?: boolean) { if (callback === listener && !!capture === captureKeys) listener = undefined; } };
  try {
    const release = containDrawerFocus({ contains: (node: unknown) => node === first || node === last, querySelectorAll: () => [first, last] }, () => { closed = true; });
    last.focus(); listener!(key("Tab")); assert.equal(active, first);
    first.focus(); listener!(key("Tab", true)); assert.equal(active, last);
    nested.focus(); listener!(key("Escape")); assert.equal(closed, false);
    first.focus();
    listener!(key("Escape", false, true)); assert.equal(closed, false);
    // TextInput stops bubbling, so only a capture listener receives its Escape.
    if (captureKeys) listener!(key("Escape"));
    assert.equal(closed, true);
    release(); assert.equal(listener, undefined); assert.equal(active, row);
  } finally { if (previousDocument === undefined) delete global.document; else global.document = previousDocument; }
});

test("reviewer dialog is wider and bounded in height, restores host defaults and leaves native unchanged", () => {
  const original = { width: "100%", maxWidth: "520px", height: "85%", maxHeight: "90%" };
  const dialog = { style: { ...original } };
  const restore = sizeReviewerDialog({ closest: (selector: string) => selector === '[role="dialog"]' ? dialog : null });
  assert.deepEqual(dialog.style, { width: "calc(100vw - 48px)", maxWidth: "720px", height: "min(560px, calc(100dvh - 48px))", maxHeight: "calc(100dvh - 48px)" });
  restore(); assert.deepEqual(dialog.style, original);
  assert.doesNotThrow(() => sizeReviewerDialog(null)());
  assert.doesNotThrow(() => sizeReviewerDialog({})());
});
