import { afterEach, describe, expect, it, vi } from "vitest";

import { connectWallet, hasWallet, sameAddress, signMessage, toHex } from "./wallet";

describe("wallet helpers", () => {
  it("hex-encodes UTF-8 for personal_sign", () => {
    expect(toHex("hi ✓")).toBe("0x686920e29c93");
  });
  it("compares addresses without case", () => {
    expect(sameAddress("0xAbC", "0xabc")).toBe(true);
  });
});

describe("the hosted demo", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("never asks a wallet, even one the page has injected", async () => {
    const request = vi.fn();
    vi.stubGlobal("ethereum", { request });
    vi.stubEnv("NEXT_PUBLIC_ASSAY_STATIC", "1");
    expect(hasWallet()).toBe(false);
    await expect(connectWallet()).rejects.toThrow();
    await expect(signMessage("hi", "0x0")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_ASSAY_STATIC", "");
    expect(hasWallet()).toBe(true);
  });
});
