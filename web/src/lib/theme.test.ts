// pack-argus-assay-c384f31f3f: without dh-theme.js, the scheme is the system's, and a change to it is reported.
import { afterEach, describe, expect, it, vi } from "vitest";

import { effectiveScheme, subscribeScheme } from "./theme";

afterEach(() => vi.unstubAllGlobals());

function systemScheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.stubGlobal("window", {});
  vi.stubGlobal("matchMedia", () => mq);
  return {
    listeners,
    flip() {
      dark = !dark;
      for (const l of [...listeners]) l();
    },
  };
}

describe("the scheme without dh-theme.js", () => {
  it("follows the system's scheme, and reports when it changes", () => {
    const system = systemScheme(false);
    const listener = vi.fn();
    const unsubscribe = subscribeScheme(listener);
    expect(effectiveScheme()).toBe("light");
    system.flip();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(effectiveScheme()).toBe("dark");
    unsubscribe();
    expect(system.listeners.size).toBe(0);
  });

  it("uses dh-theme.js's own subscription when it ran", () => {
    systemScheme(false);
    const off = vi.fn();
    const subscribe = vi.fn(() => off);
    vi.stubGlobal("window", { dhTheme: { subscribe, effective: () => "dark" } });
    const listener = vi.fn();
    expect(subscribeScheme(listener)).toBe(off);
    expect(subscribe).toHaveBeenCalledWith(listener);
    expect(effectiveScheme()).toBe("dark");
  });
});
