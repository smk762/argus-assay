/**
 * The owner's card style, and the maths the live SVG preview shares with argus-mint's bake.
 * `tintMatrix` must equal argus_mint.frames.tint_matrix number for number (style.test.ts pins it).
 */
import type { CardStyle } from "./generated/mint";

export type { CardStyle };
export type SlotStyle = NonNullable<CardStyle["slots"]>[string];
export type Effect = "none" | "shadow" | "outline" | "glow";

const LUMA = [0.299, 0.587, 0.114];

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** argus-mint's tint: each channel moves toward the colour at the pixel's own luma, by `strength`. 3×4, row-major. */
export function tintMatrix(tint: CardStyle["tint"]): number[] {
  if (!tint) return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  const s = tint.strength ?? 0.6;
  const target = hexToRgb(tint.colour).map((v) => v / 255);
  return target.flatMap((t, channel) => {
    const row = LUMA.map((w) => s * t * w);
    row[channel] += 1 - s;
    return [...row.map(round6), 0];
  });
}

/** The same matrix as an SVG feColorMatrix `values` (4×5; alpha passes through). Use color-interpolation-filters="sRGB". */
export function svgMatrix(tint: CardStyle["tint"]): string {
  const m = tintMatrix(tint);
  const row = (i: number) => [m[i * 4], m[i * 4 + 1], m[i * 4 + 2], 0, m[i * 4 + 3]];
  return [...row(0), ...row(1), ...row(2), 0, 0, 0, 1, 0].join(" ");
}

/** Hue (0–360), saturation and value (0–1) to hex, for the colour wheel. */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return rgbToHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

export const isHex = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v);

/** A style with nothing set is no style: argus-mint stores none. */
export function isPlain(style: CardStyle | null | undefined): boolean {
  return !style || (!style.tint && Object.keys(style.slots ?? {}).length === 0);
}

/** Drop slot entries that change nothing, so an untouched slot doesn't make a style. */
export function normalise(style: CardStyle): CardStyle {
  const slots = Object.fromEntries(
    Object.entries(style.slots ?? {}).filter(([, s]) => s.colour || (s.effect && s.effect !== "none") || s.background),
  );
  return { ...(style.tint ? { tint: style.tint } : {}), slots };
}

export const sameStyle = (a: CardStyle | null | undefined, b: CardStyle | null | undefined): boolean =>
  JSON.stringify(normalise(a ?? {})) === JSON.stringify(normalise(b ?? {}));
