import { afterEach, describe, expect, it, vi } from "vitest";

import { CapabilityRefused, checkTemplate, createDraft, decide, moderatorReview, readError, resetHealthMemo } from "./api";
import type { Health } from "./types";

const health = (caps: Partial<Health["capabilities"]>) =>
  ({ capabilities: { create_drafts: false, moderate: false, owner_review: false, publish: false, write_bios: false, ...caps } }) as Health;

afterEach(() => {
  vi.unstubAllGlobals();
  resetHealthMemo();
});

describe("writes are gated on /health before they reach the wire", () => {
  it("refuses a moderator review the server won't take", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ moderate: false }));
    await expect(moderatorReview("abc", true, "me", "")).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses a draft from the library where no library is served", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ create_drafts: true, library: false }));
    const draft = { template: { id: "t", version: 1 }, name: "A", to: "0x0", asset: "a", library: "007-x" };
    await expect(createDraft(draft)).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends an allowed write with the moderator token", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("sessionStorage", { getItem: () => "tok", setItem: () => {}, removeItem: () => {} });
    resetHealthMemo(health({ review_catalogue: true }));
    await decide("frame", "card-green", 1, "approve", "me");
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/frames\/card-green\/1\/review$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ decision: "approve", by: "me" });
  });
});

describe("template check", () => {
  it("isn't asked of a server that can't check", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ check_templates: false }));
    await expect(checkTemplate("example-portrait", 3)).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns argus-mint's problems as reported", async () => {
    const body = { template: { id: "example-portrait", version: 3 }, ok: false, problems: ["no workflow renders flux/x with 2 LoRAs"] };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ check_templates: true }));
    expect(await checkTemplate("example-portrait", 3)).toEqual(body);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toMatch(/\/templates\/example-portrait\/3\/check$/);
  });
});

describe("errors", () => {
  it("reads FastAPI's detail, including structured ones", async () => {
    expect(await readError(new Response(JSON.stringify({ detail: "nope" }), { status: 409 }))).toBe("nope");
    expect(await readError(new Response(JSON.stringify({ detail: { error: "all rejected" } }), { status: 422 }))).toBe("all rejected");
  });
});
