import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  CapabilityRefused,
  checkTemplate,
  createDraft,
  decide,
  makeTeaserDraft,
  moderatorReview,
  readError,
  rerunIdentityCheck,
  resetHealthMemo,
  reviewBackground,
  reviewProjectFile,
  saveProjectFile,
  startBackgrounds,
  startTrainingStep,
} from "./api";
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

describe("teaser project writes are gated on author_catalogue", () => {
  it("sends neither a save nor a review where the server can't author, even with every other capability", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ moderate: true, review_catalogue: true, create_drafts: true, author_catalogue: false }));
    await expect(saveProjectFile("p", "line", "a", 1, { text: "x" })).rejects.toBeInstanceOf(CapabilityRefused);
    await expect(reviewProjectFile("p", "line", "a", 1, "approve", "me")).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves {doc} with the moderator token, to the file's path", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ file: {}, checks: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("sessionStorage", { getItem: () => "tok", setItem: () => {}, removeItem: () => {} });
    resetHealthMemo(health({ author_catalogue: true }));
    await saveProjectFile("example-teasers", "scene", "lamp-room", 2, { prompt: "a lamp room" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/projects\/example-teasers\/files\/scene\/lamp-room\/2$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ doc: { prompt: "a lamp room" } });
  });
  it("shows an approval refusal as argus-mint's message, word for word", async () => {
    const detail = "teasers link files that aren't approved: identity lamp v1, line every-boat v1";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 409 })));
    resetHealthMemo(health({ author_catalogue: true }));
    const refusal = reviewProjectFile("example-teasers", "teasers", "example-teasers", 1, "approve", "me");
    await expect(refusal).rejects.toBeInstanceOf(ApiError);
    await expect(refusal).rejects.toMatchObject({ message: detail, status: 409 });
  });
});

describe("a teaser's layers are gated on their own capabilities", () => {
  const all = { moderate: true, author_catalogue: true, create_drafts: true, publish: true, review_catalogue: true, sample: true };
  it("sends none of them where the server says it can't, even with every other capability", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ ...all, backgrounds: false, teasers: false, identity_training: false, identity_check: false }));
    for (const write of [
      () => startBackgrounds("p", "lamp-room", 1),
      () => reviewBackground("p", "lamp-room-v1-01", "approve", "me", ""),
      () => makeTeaserDraft("p", "T1", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"),
      () => startTrainingStep("p", "keeper", 1, "candidates"),
      () => rerunIdentityCheck("abc"),
    ])
      await expect(write()).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("needs moderate as well as identity_check to run the identity check again", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    resetHealthMemo(health({ identity_check: true, moderate: false }));
    await expect(rerunIdentityCheck("abc")).rejects.toBeInstanceOf(CapabilityRefused);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends each with the moderator token, to argus-mint's path, with its body", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("sessionStorage", { getItem: () => "tok", setItem: () => {}, removeItem: () => {} });
    resetHealthMemo(health({ moderate: true, backgrounds: true, teasers: true, identity_training: true, identity_check: true }));
    await startBackgrounds("example-teasers", "lamp-room", 1);
    await reviewBackground("example-teasers", "lamp-room-v1-02", "reject", "me", "too busy");
    await makeTeaserDraft("example-teasers", "T1", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
    await startTrainingStep("example-teasers", "keeper", 1, "select");
    await rerunIdentityCheck("3f9c0e1a2b4d5e6f");
    const sent = (fetch.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => [
      url.replace(/^.*?(\/(?:projects|drafts)\/)/, "$1"),
      JSON.parse(init.body as string),
      (init.headers as Record<string, string>).Authorization,
    ]);
    expect(sent).toEqual([
      ["/projects/example-teasers/scenes/lamp-room/1/backgrounds", {}, "Bearer tok"],
      ["/projects/example-teasers/backgrounds/lamp-room-v1-02/review", { decision: "reject", by: "me", note: "too busy" }, "Bearer tok"],
      ["/projects/example-teasers/teasers/T1/draft", { to: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" }, "Bearer tok"],
      ["/projects/example-teasers/identities/keeper/1/training/select", {}, "Bearer tok"],
      ["/drafts/3f9c0e1a2b4d5e6f/identity-check", {}, "Bearer tok"],
    ]);
  });
  it("shows a teaser draft's refusal as argus-mint's message, word for word", async () => {
    const detail = "T1 has no background chosen yet (its `background` in the teaser links)";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 409 })));
    resetHealthMemo(health({ teasers: true }));
    await expect(makeTeaserDraft("example-teasers", "T1", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC")).rejects.toMatchObject({ message: detail, status: 409 });
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
