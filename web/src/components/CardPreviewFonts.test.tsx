// @vitest-environment jsdom
// pack-argus-assay-6f174f328a: the preview sets its text only once the frame's own fonts have loaded. Moving to
// another frame (or version) waits for that frame's fonts, rather than drawing in the fallback face meanwhile.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FrameInfo, FrameLayout } from "@/lib/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/api", () => ({ frameFont: (id: string, v: number, font: string) => `${id}/${v}/${font}`, frameOverlay: () => "overlay.png" }));

const frames = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "fixture", "frames.json"), "utf8")) as FrameInfo[];
const v1 = frames.find((f) => f.frame.id === "card-green")!;
const v2 = { ...v1, frame: { ...v1.frame, version: 2 } } as FrameInfo;
const layout: FrameLayout = {
  width: v1.width,
  height: v1.height,
  slots: { name: { ascent: 20, descent: 5, font: "fonts/Cinzel.ttf", size: 24, effects: { glow: 0, outline: 1, shadow: 2 }, lines: [{ text: "Hana", x: 10, y: 10 }] } },
};

// Fonts load when the test says: one pending load per frame version.
const pending = new Map<string, () => void>();
beforeEach(() => {
  const added: { family: string }[] = [];
  Object.defineProperty(document, "fonts", { configurable: true, value: Object.assign(added, { add: (f: { family: string }) => added.push(f) }) });
  vi.stubGlobal(
    "FontFace",
    class {
      constructor(
        public family: string,
        private src: string,
      ) {}
      load() {
        const version = /card-green\/(\d+)\//.exec(this.src)![1];
        return new Promise((resolve) => {
          const all = pending.get(version);
          pending.set(version, () => {
            all?.();
            resolve(this);
          });
        });
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  pending.clear();
});

describe("CardPreview's fonts", () => {
  it("waits for the new frame's fonts before setting text", async () => {
    const { CardPreview } = await import("./CardPreview");
    const el = document.createElement("div");
    const root = createRoot(el);
    const show = (frame: FrameInfo) => act(async () => root.render(<CardPreview frame={frame} artUrl="a.png" layout={layout} style={{}} />));
    await show(v1);
    expect(el.querySelectorAll("text")).toHaveLength(0);
    await act(async () => pending.get("1")!());
    expect(el.querySelectorAll("text").length).toBeGreaterThan(0);
    await show(v2); // v2's fonts are still loading
    expect(el.querySelectorAll("text")).toHaveLength(0);
    await act(async () => pending.get("2")!());
    expect(el.querySelectorAll("text").length).toBeGreaterThan(0);
    act(() => root.unmount());
  });
});
