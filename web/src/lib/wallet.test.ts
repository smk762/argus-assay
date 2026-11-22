import { afterEach, describe, expect, it, vi } from "vitest";

import { connectWallet, domainHint, hasWallet, sameAddress, signMessage, toHex } from "./wallet";

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

// argus-assay#4: argus-mint can't see the page, so a SIWE domain that isn't the page's host fails in the wallet.
describe("a wallet that refuses a sign-in for another host", () => {
  const siwe = (domain: string) =>
    `${domain} wants you to sign in with your Ethereum account:\n0xabc\n\nApprove the card image of argus-mint draft d1 for minting.`;

  afterEach(() => vi.unstubAllGlobals());

  it("names the domain to set when the sign-in's host isn't the page's", () => {
    expect(domainHint(siwe("localhost:3108"), "192.168.1.39:3443")).toBe(
      "The sign-in names localhost:3108, but this page is 192.168.1.39:3443: argus-mint's ARGUS_MINT_SIWE_DOMAIN must be 192.168.1.39:3443.",
    );
    expect(domainHint(siwe("192.168.1.39:3443"), "192.168.1.39:3443")).toBeNull();
    expect(domainHint("not a sign-in", "x:1")).toBeNull();
  });

  it("keeps the wallet's own words and adds the hint", async () => {
    vi.stubGlobal("ethereum", { request: vi.fn().mockRejectedValue(new Error("User rejected the request.")) });
    vi.stubGlobal("location", { host: "192.168.1.39:3443" });
    await expect(signMessage(siwe("localhost:3108"), "0xabc")).rejects.toThrow(
      /^User rejected the request\. The sign-in names localhost:3108, but this page is 192\.168\.1\.39:3443/,
    );
    await expect(signMessage(siwe("192.168.1.39:3443"), "0xabc")).rejects.toThrow(/^User rejected the request\.$/);
  });
});
