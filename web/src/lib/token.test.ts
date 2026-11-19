// pack-argus-assay-ec4a1ac4e9: with sessionStorage off, the token the moderator typed still holds for the page.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const broken = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("the moderator token with storage off", () => {
  it("is kept for the page, tells listeners, and can be cleared", async () => {
    vi.stubGlobal("sessionStorage", broken);
    const { getToken, onTokenChange, setToken } = await import("./token");
    const seen: string[] = [];
    onTokenChange(() => seen.push(getToken()));
    setToken("secret");
    expect(getToken()).toBe("secret");
    expect(seen).toEqual(["secret"]);
    setToken("");
    expect(getToken()).toBe("");
  });

  it("reads one a reload kept in sessionStorage", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => "kept", setItem: () => {}, removeItem: () => {} });
    const { getToken } = await import("./token");
    expect(getToken()).toBe("kept");
  });
});
