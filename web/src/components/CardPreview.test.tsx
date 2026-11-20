// pack-argus-assay-9cd7605d32: two previews of the same frame on one page must each use their own SVG
// filters. `url(#id)` resolves across the whole document, so a shared id draws every card with the
// first one's tint and glow.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { FrameInfo, FrameLayout } from "@/lib/types";

import { CardPreview } from "./CardPreview";

const frames = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixture/frames.json", import.meta.url)), "utf8")) as FrameInfo[];
const frame = frames.find((f) => f.frame.id === "card-green")!;
const layout: FrameLayout = {
  width: frame.width,
  height: frame.height,
  slots: { name: { ascent: 20, descent: 5, font: null, size: 24, effects: { glow: 3, outline: 1, shadow: 2 }, lines: [] } },
};

describe("CardPreview", () => {
  it("gives each preview of the same frame its own filter ids", () => {
    const html = renderToStaticMarkup(
      <>
        <CardPreview frame={frame} artUrl="a.png" layout={layout} style={{ tint: { colour: "#ff0000", strength: 0.5 } }} />
        <CardPreview frame={frame} artUrl="b.png" layout={layout} style={{ tint: { colour: "#0000ff", strength: 0.5 } }} />
      </>,
    );
    const ids = [...html.matchAll(/<filter[^>]* id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4); // a tint and a glow filter per preview
    expect(new Set(ids).size).toBe(ids.length);
    // Each overlay points at a tint filter that exists, and not the same one.
    const refs = [...html.matchAll(/filter="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toBe(refs[1]);
    for (const ref of refs) expect(ids).toContain(ref);
  });

  it("says effects aren't previewed when the frame lists any, and only then", () => {
    const plain = renderToStaticMarkup(<CardPreview frame={frame} artUrl="a.png" layout={layout} style={{}} />);
    expect(plain).not.toContain("effects not previewed");
    const withEffects = { ...frame, frame: { ...frame.frame, effects: [{ type: "vignette" as const, strength: 0.45, start: 0.55 }] } } satisfies FrameInfo;
    const html = renderToStaticMarkup(<CardPreview frame={withEffects} artUrl="a.png" layout={layout} style={{}} />);
    expect(html).toContain("effects not previewed: the baked PNG is what&#x27;s reviewed");
  });
});
