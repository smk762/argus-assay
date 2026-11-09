import { afterEach, describe, expect, it, vi } from "vitest";

import { CapabilityRefused, decide, moderatorReview, readError, resetHealthMemo } from "./api";
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

describe("errors", () => {
  it("reads FastAPI's detail, including structured ones", async () => {
    expect(await readError(new Response(JSON.stringify({ detail: "nope" }), { status: 409 }))).toBe("nope");
    expect(await readError(new Response(JSON.stringify({ detail: { error: "all rejected" } }), { status: 422 }))).toBe("all rejected");
  });
});
