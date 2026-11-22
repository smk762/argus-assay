// @vitest-environment jsdom
// pack-argus-assay-810c270f2d: Prev and Next change the id under a mounted page; what one draft's page held (a review's
// result, the unframed view, the editor) must not carry over to the next draft.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE = join(__dirname, "..", "..", "..", "..", "..", "fixture");
const read = (rel: string) => JSON.parse(readFileSync(join(FIXTURE, rel), "utf8"));
const A = "0d4d3368b4aad58f";
const B = "2a28c196e4117bf5";
const nav = vi.hoisted(() => ({ id: "" }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: nav.id }),
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/drafts/${nav.id}`,
}));
vi.mock("@/components/MintProvider", () => ({ useMint: () => ({ health: { capabilities: {} }, hasToken: false }) }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  getDraft: async (id: string) => read(`drafts/${id}.json`),
  getDrafts: async () => read("drafts.json"),
  getFrames: async () => read("frames.json"),
  draftImage: (id: string, which: string) => `/img/${id}/${which}`,
}));

const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe("stepping to another draft", () => {
  it("starts the next draft's page fresh", async () => {
    const { default: DraftView } = await import("./DraftView");
    const el = document.createElement("div");
    const root = createRoot(el);
    nav.id = A;
    await act(async () => root.render(<DraftView />));
    await settle();
    const toggle = () => [...el.querySelectorAll("button")].find((b) => /Show the (unframed render|card)/.test(b.textContent ?? ""))!;
    expect(toggle(), "draft A's art toggle").toBeDefined();
    await act(async () => toggle().click());
    expect(el.querySelector("img")?.getAttribute("src")).toBe(`/img/${A}/art`);
    nav.id = B;
    await act(async () => root.render(<DraftView />));
    await settle();
    expect(el.querySelector("img")?.getAttribute("src")).toBe(`/img/${B}/image`);
    expect(toggle().textContent).toMatch(/Show the unframed render/);
    act(() => root.unmount());
  });
});
