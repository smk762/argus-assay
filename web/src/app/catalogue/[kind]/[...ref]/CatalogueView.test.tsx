// @vitest-environment jsdom
// pack-argus-assay-9b8973163c: a deep link to art that isn't there (?sample=<gone>&n=…) falls back to the first art
// the <select> shows, so the frame preview can still be drawn.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = join(__dirname, "..", "..", "..", "..", "..", "..", "fixture");
const read = (rel: string) => JSON.parse(readFileSync(join(FIXTURE, rel), "utf8"));

vi.mock("next/navigation", () => ({
  useParams: () => ({ kind: "frame", ref: ["card-green", "1"] }),
  useSearchParams: () => new URLSearchParams("sample=gone&n=3"),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/catalogue/frame/card-green/1",
}));
vi.mock("@/components/MintProvider", () => ({ useMint: () => ({ health: { capabilities: {} }, hasToken: false }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getTemplates: async () => read("templates.json"),
  getFrames: async () => read("frames.json"),
  getBios: async () => read("bios.json"),
  getDrafts: async () => read("drafts.json"),
  getSamples: async () => ({ items: [], total: 0 }),
  frameOverlay: () => "overlay.png",
}));

describe("the frame preview's art", () => {
  it("falls back to the first art when the linked sample isn't there", async () => {
    const { default: CatalogueView } = await import("./CatalogueView");
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => root.render(<CatalogueView />));
    // The frame view loads drafts and samples after the catalogue itself: let both rounds settle.
    for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
    const select = [...el.querySelectorAll("select")].find((s) => s.querySelector("option")?.textContent?.startsWith("Draft: "))!;
    expect(select, "the art picker").toBeDefined();
    expect(select.value).toBe(select.options[0].value);
    const preview = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Preview"))!;
    expect(preview, "the Preview button").toBeDefined();
    expect(preview.disabled).toBe(false);
    act(() => root.unmount());
  });
});
