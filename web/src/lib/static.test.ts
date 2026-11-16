// The static demo: the tape made from fixture/, the in-browser argus-mint over it, and the client's
// static branch, which must read only the tape (never argus-mint's URL).
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BIO_FIT, buildTape, checkBios, checkPublic } from "../../../scripts/make_tape.mjs";
import { DemoMint } from "./demoMint";
import { parseTape, type Tape } from "./tape";
import type { DraftDetail, DraftList } from "./types";

const FIXTURE = fileURLToPath(new URL("../../../fixture", import.meta.url));
const tape = (): Tape => parseTape(buildTape(FIXTURE));
let clock = 0;
const mint = () => new DemoMint(tape(), { now: () => new Date(Date.UTC(2026, 10, 15, 0, 0, clock++)).toISOString(), randomHex: (n) => "ab".repeat(n) });
const draftIn = (m: DemoMint, status: string) => (m.get("/drafts").body as DraftList).items.find((d) => d.status === status)!;

describe("the tape", () => {
  it("is made from the recorded fixture, with every draft's images", () => {
    const t = tape();
    expect(t.provenance.kind).toBe("recorded");
    // At least five behind every status filter, so none of the queue's views is a near-empty page.
    for (const status of ["pending", "approved", "rejected", "published"]) expect(t.drafts.filter((d) => d.status === status).length, status).toBeGreaterThanOrEqual(5);
    for (const d of t.drafts) expect(t.files).toContain(`drafts/${d.id}/image.png`);
  });

  it("refuses an address that isn't on the allowlist, and secrets by name", () => {
    expect(checkPublic('"to": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"', "x")).toEqual([]);
    expect(checkPublic('"to": "0x1111111111111111111111111111111111111111"', "x")[0]).toMatch(/not on the allowlist/);
    expect(checkPublic('"pinata_jwt": "x"', "x")[0]).toMatch(/key or token/);
    expect(checkPublic('"header": "Bearer abcdef123456"', "x")[0]).toMatch(/bearer token/);
    expect(checkPublic('"text": "every gear a secret shared"', "x")).toEqual([]);
    expect(checkPublic('"url": "http://192.168.1.20:8108"', "x")[0]).toMatch(/LAN address/);
    // A 32-byte hash is not an address.
    expect(checkPublic(`"hash": "0x${"ab".repeat(32)}"`, "x")).toEqual([]);
  });

  it("has a distinct bio on every card, filling its box", () => {
    const t = tape();
    const bios = [...t.drafts.map((d) => d.draft.bio?.text), ...t.samples.flatMap((j) => (j.items ?? []).map((it) => it.bio))];
    expect(bios.length).toBe(t.drafts.length + t.samples.reduce((n, j) => n + (j.items ?? []).length, 0));
    expect(new Set(bios).size).toBe(bios.length);
    for (const d of t.drafts) {
      const lines = t.layouts[d.id].slots.bio.lines.length;
      expect(lines).toBeGreaterThanOrEqual(3);
      expect(lines).toBeLessThanOrEqual(4);
    }
  });

  it("refuses a bio that is too short, too long, shrunk or shared with another card", () => {
    const slot = { size: 38, height: 318, line_spacing: 1.1 };
    const at = (n: number, size = 38) => ({ size, ascent: 37, descent: 14, lines: Array.from({ length: n }, () => ({ text: "", x: 0, y: 0 })) });
    const filler = (n: number) => "Moss Warden " + "tends the quiet garden ".repeat(20).slice(0, n - 12);
    const ok = { where: "a", name: "Moss Warden", text: filler(185), layout: at(4), slot };
    expect(checkBios([ok])).toEqual([]);
    expect(checkBios([{ ...ok, text: filler(120) }])[0]).toMatch(/120 characters/);
    expect(checkBios([{ ...ok, text: filler(BIO_FIT.max_chars + 1) }])[0]).toMatch(/characters/);
    expect(checkBios([{ ...ok, layout: at(2) }])[0]).toMatch(/fills 34%/);
    expect(checkBios([{ ...ok, layout: at(5) }])[0]).toMatch(/fills 86%/);
    expect(checkBios([{ ...ok, layout: at(6, 30) }])[0]).toMatch(/shrinks to 30 px/);
    const a = "Moss Warden keeps a lantern lit for travellers who have not yet set out, and hums.";
    const b = "Ash Piper keeps a lantern lit for travellers who have not yet set out, and naps.";
    const fit = { ...BIO_FIT, min_chars: 0, banned_words: [], banned_marks: [], last_sentence_words: 0 }; // each rule below is tried on its own
    expect(checkBios([{ where: "a", name: "Moss Warden", text: a }, { where: "b", name: "Ash Piper", text: b }], fit)[0]).toMatch(/share "keeps a lantern lit for travellers"/);
    const dancing = { where: "d", name: "Ash Piper", text: "Ash Piper hums, fingers dancing like sparks on the strings." };
    const dance = { where: "e", name: "Moss Warden", text: "Moss Warden digs; trowels dance like sparks in the beds." };
    expect(checkBios([dancing, dance], fit)[0]).toMatch(/simile "fingers dancing like"|simile "dancing like sparks"/);
    expect(checkBios([{ where: "f", name: "Moss Warden", text: "In the garden Moss Warden digs." }], { ...fit, banned_openings: ["in"] })[0]).toMatch(/opens with "in"/);
    const twin = { where: "g", name: "Ash Piper", text: "At dawn Ash Piper sings to the river." };
    expect(checkBios([twin, { where: "h", name: "Moss Warden", text: "At dawn Moss Warden waters the beans." }], fit)[0]).toMatch(/open alike \("at dawn"\)/);
    expect(checkBios([{ where: "i", name: "Ash Piper", gender: "female", text: "Ash Piper sings; they never miss." }], fit)[0]).toMatch(/says "they" of a female/);
    expect(checkBios([{ where: "j", name: "Ash Piper", text: "Ash Piper hums like a bee and sleeps like a log." }], { ...fit, max_similes: 1 })[0]).toMatch(/2 "like" similes/);
    const moon = { where: "k", name: "Ash Piper", text: "Ash Piper's scales shimmer like moonlit snow." };
    expect(checkBios([moon, { where: "l", name: "Moss Warden", text: "Rakes glint like moonlit dew for Moss Warden." }], fit)[0]).toMatch(/compare "like moonlit/);
    const byName = ["Ash Piper sings.", "Ash Piper digs.", "Ash Piper naps."].map((text, n) => ({ where: `m${n}`, name: "Ash Piper", text }));
    expect(checkBios(byName, { ...fit, name_openings: 2 })[0]).toMatch(/3 bios open with the card's name, over 2/);
    expect(checkBios([{ where: "n", name: "Ash Piper", text: "Ash Piper hums while the reeds go dancing in the wind." }], { ...fit, banned_words: ["dance"] })[0]).toMatch(/stock word "dancing"/);
    expect(checkBios([{ where: "o", name: "Ash Piper", text: "Ash Piper tends the reeds by the river each dusk. Her odd habit?" }], { ...fit, last_sentence_words: 4 })[0]).toMatch(/ends on a fragment \("Her odd habit\?"\)/);
    expect(checkBios([{ where: "p", name: "Ash Piper", text: "Reeds whisper... Ash Piper listens to them all night long." }], { ...fit, banned_marks: ["..."] })[0]).toMatch(/uses "\.\.\."/);
    expect(checkBios([{ where: "q", name: "Ash Piper", text: "Ash Piper hums while a dancer twirls past the reeds." }], { ...fit, banned_words: ["dance"] })[0]).toMatch(/stock word "dancer"/);
    expect(checkBios([{ where: "r", name: "Ash Piper", text: "Reeds sway by the river all night long." }], fit)[0]).toMatch(/names the card 0 times/);
    expect(checkBios([{ where: "s", name: "Ash Piper", text: 'Ash Piper waves and calls "Goodnight, reeds.' }], fit)[0]).toMatch(/quotation open/);
    // Five words in common is allowed, and the names don't count.
    const c = "Nightly, Ash Piper keeps a lantern lit for nobody in particular.";
    expect(checkBios([{ where: "a", name: "Moss Warden", text: a }, { where: "c", name: "Ash Piper", text: c }], fit)).toEqual([]);
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
    const published = (m.get("/drafts?status=published").body as DraftList).items.length;
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
    expect((m.get("/drafts?status=published").body as DraftList).items).toHaveLength(published + 1);
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
    expect(list.items).toHaveLength(t.drafts.length);
    const id = list.items[0].id;
    await api.moderatorReview(id, true, "me", "");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.draftImage(id, "image", "abc")).toBe(`/data-tape/drafts/${id}/image.png`);
    expect(api.libraryImage("000-x", 640)).toBe("/data-tape/library/000-x.jpg");
    await expect(api.createDraft({ template: { id: "t", version: 1 }, name: "A", to: "0x0", asset: "a" })).rejects.toBeInstanceOf(api.CapabilityRefused);
    await expect(api.previewFrame("card-green", 1, {}, "x", null, {})).rejects.toThrow(/not in this demo/);
  });
});
