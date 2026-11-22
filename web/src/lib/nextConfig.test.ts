import { afterEach, describe, expect, it, vi } from "vitest";

// The live build's /mint proxy (ASSAY_MINT_PROXY) must outwait a draft: making one renders through darkroom and
// writes a bio, which takes longer than Next's 30 s default. Shorter, and the proxy hangs up while argus-mint
// keeps going, so the draft is made but the browser gets a 500 (argus-assay#4).
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("../../next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

describe("next.config", () => {
  it("gives the /mint proxy minutes, not Next's 30 s, to answer", async () => {
    const config = await load({ ASSAY_MINT_PROXY: "http://127.0.0.1:8108", ASSAY_STATIC: "" });
    expect(await config.rewrites!()).toEqual([{ source: "/mint/:path*", destination: "http://127.0.0.1:8108/:path*" }]);
    expect(config.experimental?.proxyTimeout).toBeGreaterThanOrEqual(5 * 60_000);
  });

  it("has no proxy settings in the static demo", async () => {
    const config = await load({ ASSAY_STATIC: "1" });
    expect(config.output).toBe("export");
    expect(config.experimental).toBeUndefined();
  });
});
