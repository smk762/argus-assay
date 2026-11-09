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
});
