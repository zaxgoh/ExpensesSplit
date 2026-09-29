import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom lacks ResizeObserver, which Radix primitives (Switch, Tabs) observe.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const proto = Element.prototype as unknown as Record<string, unknown>;
if (typeof proto.hasPointerCapture !== "function") {
  proto.hasPointerCapture = () => false;
}
if (typeof proto.scrollIntoView !== "function") {
  proto.scrollIntoView = () => {};
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});
