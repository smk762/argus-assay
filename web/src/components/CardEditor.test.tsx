// @vitest-environment jsdom
// pack-argus-assay-de10226a58: on a frame whose look is locked, the editor offers no style change. "Plain style"
// used to stay, and clicking it put a style edit (which the frame forbids) up for the owner to sign.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import type { DraftDetail, FrameInfo } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/api", () => ({
  draftImage: () => "art.png",
  frameLayout: async () => ({ width: 1, height: 1, slots: {} }),
  frameFont: () => "font.ttf",
  frameOverlay: () => "overlay.png",
  ownerEdit: vi.fn(),
  ownerEditChallenge: vi.fn(),
}));
vi.mock("./MintProvider", () => ({ useMint: () => ({ health: { mock: true, capabilities: { edit_text: true } } }) }));

const FIXTURE = join(__dirname, "..", "..", "..", "fixture");
const frame = (JSON.parse(readFileSync(`${FIXTURE}/frames.json`, "utf8")) as FrameInfo[]).find((f) => f.frame.id === "card-green")!;
const framed = readdirSync(`${FIXTURE}/drafts`)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(`${FIXTURE}/drafts/${f}`, "utf8")) as DraftDetail)
  .find((d) => d.draft.frame?.id === "card-green" && d.status !== "published")!;

async function editor(locked: boolean) {
  const { CardEditor } = await import("./CardEditor");
  const f = { ...frame, frame: { ...frame.frame, style_locked: locked } } as FrameInfo;
  // A draft that already has a style: "Plain style" would change it.
  const d = { ...framed, draft: { ...framed.draft, style: { tint: { colour: "#ff0000", strength: 0.5 }, slots: {} } } } as DraftDetail;
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => root.render(<CardEditor d={d} frame={f} onDone={() => {}} onClose={() => {}} />));
  const button = (label: string) => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  return { el, root, button };
}

describe("CardEditor on a style-locked frame", () => {
  it("offers no Plain style, so no style edit can be made", async () => {
    const { el, root, button } = await editor(true);
    expect(el.textContent).toContain("This frame's look is fixed");
    expect(button("Plain style")).toBeUndefined();
    expect(el.textContent).toContain("Nothing changed yet.");
    act(() => root.unmount());
  });

  it("still offers it where the look can change", async () => {
    const { root, button } = await editor(false);
    expect(button("Plain style")).toBeDefined();
    act(() => root.unmount());
  });
});
