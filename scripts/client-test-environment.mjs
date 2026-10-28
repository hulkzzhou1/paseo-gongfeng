import { Window } from "happy-dom";

process.env.NODE_ENV = "test";
export const window = new Window({ url: "https://paseo.example" });
for (const key of ["window", "document", "navigator", "HTMLElement"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : window[key] });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(window.HTMLElement.prototype, { measureInWindow(callback) { callback(0, 0, 1100, 800); }, scrollTo() {} });
