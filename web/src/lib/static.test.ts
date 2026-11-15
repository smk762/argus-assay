// The static demo: the tape made from fixture/, the in-browser argus-mint over it, and the client's
// static branch, which must read only the tape (never argus-mint's URL).
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildTape, checkPublic } from "../../../scripts/make_tape.mjs";
import { DemoMint } from "./demoMint";
import { parseTape, type Tape } from "./tape";
import type { DraftDetail, DraftList } from "./types";

const FIXTURE = fileURLToPath(new URL("../../../fixture", import.meta.url));
const tape = (): Tape => parseTape(buildTape(FIXTURE));
let clock = 0;
const mint = () => new DemoMint(tape(), { now: () => new Date(Date.UTC(2026, 10, 15, 0, 0, clock++)).toISOString(), randomHex: (n) => "ab".repeat(n) });
const draftIn = (m: DemoMint, status: string) => (m.get("/drafts").body as DraftList).items.find((d) => d.status === status)!;

describe("the tape", () => {
  it("is made from the fixture as sample data, with every draft's images", () => {
    const t = tape();
    expect(t.provenance.kind).toBe("sample");
    expect(t.drafts.map((d) => d.status).sort()).toEqual(["approved", "pending", "pending", "published", "rejected"]);
    for (const d of t.drafts) expect(t.files).toContain(`drafts/${d.id}/image.png`);
  });

  it("refuses an address that isn't on the allowlist, and secrets by name", () => {
    expect(checkPublic('"to": "0x84d8530C85fA894c35563fD3b35a9c7695Ca9e60"', "x")).toEqual([]);
    expect(checkPublic('"to": "0x1111111111111111111111111111111111111111"', "x")[0]).toMatch(/not on the allowlist/);
    expect(checkPublic('"pinata_jwt": "x"', "x")[0]).toMatch(/key or token/);
    expect(checkPublic('"url": "http://192.168.1.20:8108"', "x")[0]).toMatch(/LAN address/);
    // A 32-byte hash is not an address.
    expect(checkPublic(`"hash": "0x${"ab".repeat(32)}"`, "x")).toEqual([]);
  });

  it("rejects a tape whose paths climb out of it", () => {
    expect(() => parseTape({ ...tape(), files: ["../secret.png"] })).toThrow(/not a tape path/);
  });
});

describe("the in-browser argus-mint", () => {
  it("offers the demo owner and turns off what needs a GPU", () => {
    const health = mint().get("/health").body as { mock: boolean; capabilities: Record<string, boolean> };
    expect(health.mock).toBe(true);
    expect(health.capabilities.create_drafts).toBe(false);
    expect(health.capabilities.sample).toBe(false);
    expect(health.capabilities.moderate).toBe(true);
  });

  it("walks a pending draft through both reviews to published", () => {
    const m = mint();
    const id = draftIn(m, "pending").id;
    let d = m.post(`/drafts/${id}/review`, { role: "moderator", approve: true, by: "mod", note: "" }).body as DraftDetail;
    expect(d.awaiting).toEqual(["owner"]);
    expect(m.post(`/drafts/${id}/review`, { role: "moderator", approve: true, by: "mod" }).status).toBe(409);
    d = m.post(`/drafts/${id}/review`, { role: "owner", approve: true, message: "m", signature: "0xdemo" }).body as DraftDetail;
    expect(d.status).toBe("approved");
    expect(d.draft.reviews?.at(-1)?.by).toBe(d.draft.to);
    d = m.post(`/drafts/${id}/publish`, {}).body as DraftDetail;
    expect(d.status).toBe("published");
    expect((d.published?.metadata as { name: string }).name).toBe(d.draft.name);
    expect((m.get("/drafts?status=published").body as DraftList).items).toHaveLength(2);
  });

  it("answers with copies, so the page never holds the state", () => {
    const m = mint();
    const id = draftIn(m, "pending").id;
    const first = m.get(`/drafts/${id}`).body as DraftDetail;
    first.status = "published";
    expect((m.get(`/drafts/${id}`).body as DraftDetail).status).toBe("pending");
  });

  it("records the owner's edit and asks for both approvals again", () => {
    const m = mint();
    const id = draftIn(m, "approved").id;
    const d = m.post(`/drafts/${id}/edit`, { name: "Renamed", message: "m", signature: "0xdemo" }).body as DraftDetail;
    expect(d.status).toBe("pending");
    expect(d.awaiting).toEqual(["moderator", "owner"]);
    expect(d.draft.edits?.at(-1)?.fields).toEqual(["name"]);
    expect(m.post(`/drafts/${id}/edit`, { name: "Renamed" }).status).toBe(409);
  });

  it("lays out text from the recording, or approximately", () => {
    const m = mint();
    const t = tape();
    const frame = t.frames.find((f) => f.frame.status === "approved")!.frame;
    const recorded = Object.values(t.layouts)[0].slots.name;
    const name = recorded.lines.map((l) => l.text).join(" ");
    const layout = m.post(`/frames/${frame.id}/${frame.version}/layout`, { texts: { name, class: "Something new" } }).body as {
      slots: Record<string, { lines: unknown[] }>;
    };
    expect(layout.slots.name).toEqual(recorded);
    expect(layout.slots.class.lines).toHaveLength(1);
  });

  it("keeps catalogue decisions, and refuses the writes that need a GPU", () => {
    const m = mint();
    const draft = tape().templates.find((e) => e.template.status === "draft")!.template;
    expect(m.post(`/templates/${draft.id}/${draft.version}/review`, { decision: "approve", by: "me" }).status).toBe(200);
    expect((m.get("/templates").body as { template: { version: number; status: string } }[]).find((e) => e.template.version === draft.version)?.template.status).toBe("approved");
    expect(m.post("/drafts", {}).status).toBe(503);
    expect(m.post("/samples", {}).status).toBe(503);
    expect(m.post("/frames/card-green/1/preview", {}).status).toBe(503);
  });
});

describe("the client's static branch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reads only the tape, and points images at it", async () => {
    vi.stubEnv("NEXT_PUBLIC_ASSAY_STATIC", "1");
    const t = tape();
    const fetch = vi.fn(async (url: string) => {
      expect(url).toBe("/data-tape/tape.json");
      return new Response(JSON.stringify(t));
    });
    vi.stubGlobal("fetch", fetch);
    const api = await import("./api");
    const list = await api.getDrafts();
    expect(list.items).toHaveLength(5);
    const id = list.items[0].id;
    await api.moderatorReview(id, true, "me", "");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.draftImage(id, "image", "abc")).toBe(`/data-tape/drafts/${id}/image.png`);
    expect(api.libraryImage("000-x", 640)).toBe("/data-tape/library/000-x.jpg");
    await expect(api.createDraft({ template: { id: "t", version: 1 }, name: "A", to: "0x0", asset: "a" })).rejects.toBeInstanceOf(api.CapabilityRefused);
    await expect(api.previewFrame("card-green", 1, {}, "x", null, {})).rejects.toThrow(/not in this demo/);
  });
});
