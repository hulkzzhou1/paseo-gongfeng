// Keep host DOM compatibility here; native clients keep their host-owned modal behavior.
export function widenDescriptionDialog(node: unknown): () => void {
  const root = node as { closest?(selector: string): { style: { width: string; maxWidth: string } } | null } | null;
  const dialog = root?.closest?.('[role="dialog"]');
  if (!dialog) return () => {};
  // shortcut: Paseo 0.12 has no modal width prop; replace when the installed SDK exposes one.
  const { width, maxWidth } = dialog.style;
  dialog.style.width = "calc(100vw - 48px)";
  dialog.style.maxWidth = "1040px";
  return () => { dialog.style.width = width; dialog.style.maxWidth = maxWidth; };
}

interface FocusElement {
  focus(): void;
  isConnected: boolean;
  contains(element: unknown): boolean;
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { width: number; height: number };
  querySelectorAll(selector: string): ArrayLike<FocusElement>;
}
interface KeyEvent {
  key: string; shiftKey: boolean; defaultPrevented: boolean;
  isComposing?: boolean;
  preventDefault(): void; stopPropagation(): void;
}
interface FocusDocument {
  activeElement: FocusElement | null;
  addEventListener(type: string, listener: (event: KeyEvent) => void, capture?: boolean): void;
  removeEventListener(type: string, listener: (event: KeyEvent) => void, capture?: boolean): void;
}

export function containDrawerFocus(node: unknown, close: () => void): () => void {
  const document = (globalThis as unknown as { document?: FocusDocument }).document;
  const root = node as FocusElement | null;
  if (!document || !root?.querySelectorAll) return () => {};
  const previous = document.activeElement;
  const keydown = (event: KeyEvent) => {
    // Host dialogs render outside the drawer. Let their own focus boundary handle keys.
    if (event.defaultPrevented || event.isComposing || !root.contains(document.activeElement)) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== "Tab") return;
    const elements = Array.from(root.querySelectorAll('a[href],input,textarea,button,[role="button"],[tabindex]')).filter(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && element.getAttribute("tabindex") !== "-1" && element.getAttribute("disabled") === null && element.getAttribute("aria-disabled") !== "true";
    });
    const target = event.shiftKey && document.activeElement === elements[0] ? elements.at(-1)
      : !event.shiftKey && document.activeElement === elements.at(-1) ? elements[0] : undefined;
    if (target) { event.preventDefault(); target.focus(); }
  };
  // React Native Web TextInput stops keydown bubbling, including Escape and Tab.
  document.addEventListener("keydown", keydown, true);
  return () => { document.removeEventListener("keydown", keydown, true); if (previous?.isConnected) previous.focus(); };
}
