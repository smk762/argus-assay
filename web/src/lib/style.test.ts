import { describe, expect, it } from "vitest";

import { hexToHsv, hsvToHex, isPlain, normalise, sameStyle, svgMatrix, tintMatrix } from "./style";

describe("tint matches argus-mint's bake", () => {
  it("is the same matrix, number for number", () => {
    // From argus_mint.frames.tint_matrix(Tint(colour=..., strength=...)).
    expect(tintMatrix({ colour: "#7a3cc8", strength: 0.75 })).toEqual([
      0.357288, 0.210629, 0.040906, 0, 0.052765, 0.353588, 0.020118, 0, 0.175882, 0.345294, 0.317059, 0,
    ]);
    expect(tintMatrix({ colour: "#ff8000", strength: 0.3 })).toEqual([0.7897, 0.1761, 0.0342, 0, 0.045026, 0.788395, 0.017167, 0, 0, 0, 0.7, 0]);
    expect(tintMatrix(null)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
  });
  it("becomes a 4×5 SVG matrix with alpha untouched", () => {
    const values = svgMatrix({ colour: "#ffffff", strength: 0 }).split(" ").map(Number);
    expect(values).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
  });
});

describe("colour wheel conversions", () => {
  it("round-trips", () => {
    for (const hex of ["#7a3cc8", "#000000", "#ffffff", "#ff8000", "#123456"]) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });
});

describe("plain styles", () => {
  it("treats untouched slots as no style", () => {
    expect(isPlain(normalise({ slots: { name: { effect: "none" } } }))).toBe(true);
    expect(sameStyle({ slots: { name: {} } }, null)).toBe(true);
    expect(sameStyle({ tint: { colour: "#000000" } }, null)).toBe(false);
  });

  it("compares what the card shows, not key order or no-op fields (pack-argus-assay-f44fdd9acc)", () => {
    // Effect toggled to shadow and back: "none" (and its colour) change nothing.
    expect(sameStyle({ slots: { name: { colour: "#ffffff" } } }, { slots: { name: { colour: "#ffffff", effect: "none", effect_colour: "#000000" } } })).toBe(true);
    // The server's key order against the editor's.
    expect(sameStyle({ tint: { strength: 0.5, colour: "#ff0000" } } as never, { tint: { colour: "#ff0000", strength: 0.5 } })).toBe(true);
    expect(
      sameStyle(
        { slots: { bio: { background: { radius: 8, colour: "#000000", opacity: 0.6 } }, name: { effect: "glow", colour: "#fff000" } } },
        { slots: { name: { colour: "#fff000", effect: "glow" }, bio: { background: { colour: "#000000", opacity: 0.6, radius: 8 } } } },
      ),
    ).toBe(true);
    // A real difference still counts.
    expect(sameStyle({ slots: { name: { effect: "glow" } } }, { slots: { name: { effect: "shadow" } } })).toBe(false);
    expect(sameStyle({ slots: { name: { effect: "glow", effect_colour: "#ff0000" } } }, { slots: { name: { effect: "glow" } } })).toBe(false);
  });
});
