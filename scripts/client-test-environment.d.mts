// Keep browser-emulator globals out of the plugin's Node/React Native types.
interface TestElement {
  value: string;
  disabled: boolean;
  textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): TestElement | null;
  querySelectorAll(selector: string): Iterable<TestElement>;
  append(element: TestElement): void;
  remove(): void;
  click(): void;
  dispatchEvent(event: unknown): void;
}
export const window: {
  document: TestElement & { body: TestElement; createElement(tag: string): TestElement };
  Event: new (type: string, options: { bubbles: boolean }) => unknown;
};
