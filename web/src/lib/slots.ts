import type { FrameInfo, TextSlot } from "./types";

/** The slots argus-mint fills itself; the rest take the consumer's display text. */
export const RESERVED_SLOTS = ["name", "bio"] as const;

export const displaySlots = (frame: FrameInfo["frame"] | undefined | null): string[] =>
  Object.keys(frame?.texts ?? {}).filter((slot) => !(RESERVED_SLOTS as readonly string[]).includes(slot));

/** A box as percentages of the overlay, to draw over a scaled <img>. */
export function boxStyle(
  box: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): { left: string; top: string; width: string; height: string } {
  const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
  return { left: pct(box.x, width), top: pct(box.y, height), width: pct(box.width, width), height: pct(box.height, height) };
}

/** One line describing how a slot fits text. */
export function slotSummary(slot: TextSlot): string {
  const size = `${slot.min_size ?? 12}–${slot.size ?? 48}px`;
  const font = slot.font ? slot.font.split("/").pop() : "built-in font";
  return `${slot.width}×${slot.height} · ${size} · ${font}${slot.wrap ? " · wraps" : ""}`;
}

/** The art window's aspect ratio, and the closest render size to suggest. */
export function windowAspect(frame: FrameInfo["frame"]): { ratio: number; suggest: string } {
  const ratio = frame.window.width / frame.window.height;
  const sizes: [number, number][] = [
    [1024, 1024], [1152, 896], [1216, 832], [1344, 768], [896, 1152], [832, 1216], [768, 1344],
  ];
  const [w, h] = sizes.reduce((best, s) => (Math.abs(s[0] / s[1] - ratio) < Math.abs(best[0] / best[1] - ratio) ? s : best));
  return { ratio, suggest: `${w}×${h}` };
}

/** How much of a render a frame's cover-fit crops away, as a fraction (0 = none). */
export function cropFraction(renderW: number, renderH: number, frame: FrameInfo["frame"]): number {
  const { width, height } = frame.window;
  const scale = Math.max(width / renderW, height / renderH);
  const shown = (width * height) / (renderW * scale * renderH * scale);
  return Math.max(0, 1 - shown);
}
